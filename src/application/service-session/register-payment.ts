import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "./recalculate-totals";
import { canRegisterPayment, statusAfterPayment } from "@/domain/service-session/closing";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class RegisterPaymentError extends Error {}

const registerSchema = z.object({
  paymentMethodId: z.string().min(1),
  amount: z.coerce.number().positive("Informe um valor de pagamento maior que zero."),
  idempotencyKey: z.string().min(1),
});

// Registra um pagamento — pode ser chamado várias vezes pra combinar mais
// de uma forma no mesmo fechamento (regra 13). Idempotente de verdade
// (regra 18/19, mesmo padrão de createOrder): chave repetida devolve o
// pagamento já existente, nunca duplica.
export async function registerPayment(
  serviceSessionId: string,
  actorUserId: string,
  input: { paymentMethodId: string; amount: string | number; idempotencyKey: string },
) {
  const data = registerSchema.parse(input);

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing)
        return { payment: existing, created: false as const, tableId: null, restaurantId: null };

      const session = await tx.serviceSession.findUniqueOrThrow({
        where: { id: serviceSessionId },
        include: { table: true },
      });

      if (!canRegisterPayment(session.status)) {
        throw new RegisterPaymentError(
          "Solicite o fechamento da mesa antes de registrar um pagamento.",
        );
      }

      const method = await tx.paymentMethod.findFirst({
        where: { id: data.paymentMethodId, restaurantId: session.table.restaurantId, active: true },
      });
      if (!method) throw new RegisterPaymentError("Forma de pagamento inválida ou inativa.");

      const amount = toDecimal(data.amount);
      const balance = toDecimal(session.balanceAmount);
      if (amount.greaterThan(balance)) {
        throw new RegisterPaymentError(`Valor maior que o saldo restante (${balance.toFixed(2)}).`);
      }

      const payment = await tx.payment.create({
        data: {
          serviceSessionId,
          paymentMethodId: data.paymentMethodId,
          amount,
          idempotencyKey: data.idempotencyKey,
          registeredById: actorUserId,
        },
      });

      await writeAuditLog(tx, {
        restaurantId: session.table.restaurantId,
        userId: actorUserId,
        action: "payment.registered",
        entityType: "Payment",
        entityId: payment.id,
        metadata: { amount: amount.toString(), paymentMethod: method.name },
      });

      const activePayments = await tx.payment.findMany({
        where: { serviceSessionId, voidedAt: null },
      });
      const paidAmount = sumDecimals(activePayments.map((p) => p.amount));

      await recalculateSessionTotals(tx, serviceSessionId, {
        discountAmount: session.discountAmount,
        serviceChargeAmount: session.serviceChargeAmount,
        paidAmount,
      });

      const totalAmount = toDecimal(session.totalAmount);
      const remainingBalance = totalAmount.sub(paidAmount).lessThan(ZERO)
        ? ZERO
        : totalAmount.sub(paidAmount);
      const newStatus = statusAfterPayment(remainingBalance);

      await tx.serviceSession.update({
        where: { id: serviceSessionId },
        data: { status: newStatus },
      });
      if (newStatus === "PARTIALLY_PAID") {
        await tx.table.update({
          where: { id: session.tableId },
          data: { status: "PARTIALLY_PAID" },
        });
      }

      return {
        payment,
        created: true as const,
        tableId: session.tableId,
        restaurantId: session.table.restaurantId,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );

  if (result.created && result.tableId && result.restaurantId) {
    await runAfterResponse(() =>
      publishChange(
        [tableChannel(result.tableId!), restaurantTablesChannel(result.restaurantId!)],
        "service_session.payment_registered",
      ),
    );
  }

  return result.payment;
}

const voidSchema = z
  .string()
  .trim()
  .min(3, "Informe o motivo do estorno (mínimo 3 caracteres).")
  .max(300);

// Pagamento nunca é apagado (regra 8) — estorno é anulação registrada
// (voidedAt/voidReason), preservando o original.
export async function voidPayment(paymentId: string, actorUserId: string, reason: string) {
  const voidReason = voidSchema.parse(reason);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { serviceSession: { include: { table: true } } },
    });

    if (payment.voidedAt) throw new RegisterPaymentError("Este pagamento já foi estornado.");

    await tx.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason, voidedById: actorUserId },
    });

    await writeAuditLog(tx, {
      restaurantId: payment.serviceSession.table.restaurantId,
      userId: actorUserId,
      action: "payment.voided",
      entityType: "Payment",
      entityId: payment.id,
      metadata: { amount: payment.amount.toString(), reason: voidReason },
    });

    const activePayments = await tx.payment.findMany({
      where: { serviceSessionId: payment.serviceSessionId, voidedAt: null },
    });
    const paidAmount = sumDecimals(activePayments.map((p) => p.amount));

    await recalculateSessionTotals(tx, payment.serviceSessionId, {
      discountAmount: payment.serviceSession.discountAmount,
      serviceChargeAmount: payment.serviceSession.serviceChargeAmount,
      paidAmount,
    });

    // Estornar pagamento nunca regride de PAID pra PARTIALLY_PAID
    // sozinho seria surpreendente demais numa mesa já sendo finalizada —
    // mas o saldo readquirido precisa refletir na tela mesmo assim, então
    // o status volta a PARTIALLY_PAID sempre que sobra saldo de novo,
    // simetricamente à regra de statusAfterPayment.
    const totalAmount = toDecimal(payment.serviceSession.totalAmount);
    const remainingBalance = totalAmount.sub(paidAmount).lessThan(ZERO)
      ? ZERO
      : totalAmount.sub(paidAmount);
    if (remainingBalance.greaterThan(ZERO)) {
      await tx.serviceSession.update({
        where: { id: payment.serviceSessionId },
        data: { status: "PARTIALLY_PAID" },
      });
      await tx.table.update({
        where: { id: payment.serviceSession.tableId },
        data: { status: "PARTIALLY_PAID" },
      });
    }

    return {
      tableId: payment.serviceSession.tableId,
      restaurantId: payment.serviceSession.table.restaurantId,
    };
  });

  await runAfterResponse(() =>
    publishChange(
      [tableChannel(result.tableId), restaurantTablesChannel(result.restaurantId)],
      "service_session.payment_voided",
    ),
  );

  return result;
}
