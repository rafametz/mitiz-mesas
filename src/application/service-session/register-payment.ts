import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "./recalculate-totals";
import { canRegisterPayment } from "@/domain/service-session/closing";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";
import {
  computeItemLineTotal,
  distributeUnitsFifo,
  InsufficientQuantityError,
  openAmountForItem,
  type PayableOrderItemInput,
} from "@/domain/payment/item-allocation";

export class RegisterPaymentError extends Error {}

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006) — o
// operador monta na etapa 1 (tela de seleção de consumo) o que está sendo
// pago, sem gravar nada; só ao confirmar aqui é que vira Payment +
// PaymentItemAllocation, na mesma transação. Cada entrada resolve contra o
// estado FRESCO do banco (nunca contra o que a tela do operador tinha
// carregado), mesmo racional do saldo em registerPayment.
const unitsAllocationSchema = z.object({
  type: z.literal("UNITS"),
  // Linhas de origem reais (OrderItem) que compõem o grupo mostrado na
  // tela (ex.: chopes lançados em dois pedidos diferentes) — a aplicação
  // consome delas mais antiga primeiro (distributeUnitsFifo).
  orderItemIds: z.array(z.string().min(1)).min(1),
  quantity: z.coerce.number().int().positive(),
});

const amountAllocationSchema = z.object({
  type: z.literal("AMOUNT"),
  orderItemId: z.string().min(1),
  // FULL: todo o saldo aberto do item. SHARE: N partes do rateio vigente
  // (openShareParts) — v1 só existe para item lançado com quantity = 1.
  // CUSTOM: valor livre digitado pelo operador, limitado ao saldo aberto.
  mode: z.enum(["FULL", "SHARE", "CUSTOM"]),
  parts: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().positive().optional(),
});

const allocationRequestSchema = z.discriminatedUnion("type", [
  unitsAllocationSchema,
  amountAllocationSchema,
]);

// Exportado só pra tipar o JSON vindo do formulário na camada de
// aplicação (actions.ts) sem precisar de `any` — a validação de verdade
// continua sendo o `.parse` abaixo, isto aqui é só o tipo.
export type AllocationRequest = z.infer<typeof allocationRequestSchema>;

const registerSchema = z.object({
  paymentMethodId: z.string().min(1),
  // Opcional quando `allocations` vem preenchido — o valor final é sempre
  // recalculado no servidor a partir delas, nunca confiado do cliente.
  // Continua obrigatório no fluxo livre (sem detalhar itens), como sempre.
  amount: z.coerce.number().positive("Informe um valor de pagamento maior que zero.").optional(),
  idempotencyKey: z.string().min(1),
  // Pagamento por pessoa (revisão 2026-08-10) — omitido/undefined é
  // pagamento geral da mesa, como sempre foi.
  guestId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  allocations: z.array(allocationRequestSchema).optional(),
});

type ResolvedAllocation = {
  orderItemId: string;
  kind: "UNITS" | "AMOUNT";
  quantity: number | null;
  shareNumerator: number | null;
  shareDenominator: number | null;
  amount: Prisma.Decimal;
};

function toPayableOrderItemInput(item: {
  id: string;
  productId: string;
  productNameAtOrder: string;
  meatPoint: PayableOrderItemInput["meatPoint"];
  guestId: string | null;
  guest: { name: string | null } | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  openShareParts: number | null;
  createdAt: Date;
  modifiers: { modifierNameAtOrder: string; priceDeltaAtOrder: Prisma.Decimal; quantity: number }[];
  allocations: { kind: "UNITS" | "AMOUNT"; quantity: number | null; amount: Prisma.Decimal; payment: { voidedAt: Date | null } }[];
}): PayableOrderItemInput {
  return {
    id: item.id,
    productId: item.productId,
    productNameAtOrder: item.productNameAtOrder,
    meatPoint: item.meatPoint,
    guestId: item.guestId,
    guestName: item.guest?.name ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    modifiers: item.modifiers,
    openShareParts: item.openShareParts,
    createdAt: item.createdAt,
    allocations: item.allocations.map((a) => ({
      kind: a.kind,
      quantity: a.quantity,
      amount: a.amount,
      voided: a.payment.voidedAt !== null,
    })),
  };
}

async function resolveAllocations(
  tx: Prisma.TransactionClient,
  serviceSessionId: string,
  requests: z.infer<typeof allocationRequestSchema>[],
): Promise<{ resolved: ResolvedAllocation[]; totalAmount: Prisma.Decimal }> {
  const orderItemIds = [
    ...new Set(
      requests.flatMap((r) => (r.type === "UNITS" ? r.orderItemIds : [r.orderItemId])),
    ),
  ];

  const items = await tx.orderItem.findMany({
    where: { id: { in: orderItemIds }, order: { serviceSessionId }, status: { not: "CANCELLED" } },
    include: {
      modifiers: true,
      guest: true,
      allocations: { include: { payment: { select: { voidedAt: true } } } },
    },
  });
  const itemsById = new Map(items.map((item) => [item.id, toPayableOrderItemInput(item)]));

  const resolved: ResolvedAllocation[] = [];

  for (const request of requests) {
    if (request.type === "UNITS") {
      const sourceItems = request.orderItemIds
        .map((id) => itemsById.get(id))
        .filter((item): item is PayableOrderItemInput => {
          if (!item) throw new RegisterPaymentError("Item não encontrado ou já cancelado.");
          return true;
        })
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => ({
          itemId: item.id,
          openQuantity: item.quantity - paidUnits(item),
          unitPrice: computeItemLineTotal(item).div(item.quantity),
        }));

      let distribution;
      try {
        distribution = distributeUnitsFifo(request.quantity, sourceItems);
      } catch (error) {
        if (error instanceof InsufficientQuantityError) {
          throw new RegisterPaymentError(error.message);
        }
        throw error;
      }

      for (const piece of distribution) {
        resolved.push({
          orderItemId: piece.orderItemId,
          kind: "UNITS",
          quantity: piece.quantity,
          shareNumerator: null,
          shareDenominator: null,
          amount: piece.amount,
        });
      }
      continue;
    }

    const item = itemsById.get(request.orderItemId);
    if (!item) throw new RegisterPaymentError("Item não encontrado ou já cancelado.");
    const openAmount = openAmountForItem(item);

    if (request.mode === "FULL") {
      if (openAmount.lessThanOrEqualTo(ZERO)) {
        throw new RegisterPaymentError("Este item já está totalmente pago.");
      }
      resolved.push({
        orderItemId: item.id,
        kind: "AMOUNT",
        quantity: null,
        shareNumerator: null,
        shareDenominator: null,
        amount: openAmount,
      });
      continue;
    }

    if (request.mode === "SHARE") {
      if (!item.openShareParts || item.openShareParts <= 0) {
        throw new RegisterPaymentError("Este item não está dividido em partes.");
      }
      const parts = request.parts ?? 1;
      if (parts > item.openShareParts) {
        throw new RegisterPaymentError(
          `Só há ${item.openShareParts} parte(s) em aberto, foi pedido ${parts}.`,
        );
      }
      const nominalPart = openAmount.div(item.openShareParts).toDecimalPlaces(2);
      const amount = nominalPart.mul(parts);
      resolved.push({
        orderItemId: item.id,
        kind: "AMOUNT",
        quantity: null,
        shareNumerator: parts,
        shareDenominator: item.openShareParts,
        amount,
      });
      continue;
    }

    // CUSTOM
    if (request.amount === undefined) {
      throw new RegisterPaymentError("Informe o valor personalizado.");
    }
    const amount = toDecimal(request.amount);
    if (amount.greaterThan(openAmount)) {
      throw new RegisterPaymentError(
        `Valor maior que o saldo em aberto deste item (${openAmount.toFixed(2)}).`,
      );
    }
    resolved.push({
      orderItemId: item.id,
      kind: "AMOUNT",
      quantity: null,
      shareNumerator: null,
      shareDenominator: null,
      amount,
    });
  }

  return { resolved, totalAmount: sumDecimals(resolved.map((r) => r.amount)) };
}

function paidUnits(item: PayableOrderItemInput): number {
  return item.allocations
    .filter((a) => !a.voided && a.kind === "UNITS")
    .reduce((total, a) => total + (a.quantity ?? 0), 0);
}

// Registra um pagamento — pode ser chamado várias vezes pra combinar mais
// de uma forma no mesmo fechamento (regra 13), a qualquer momento do
// atendimento ativo (OPEN ou CLOSING — revisão 2026-08-10: pagamento nunca
// exigiu fechamento solicitado, e nunca muda o status da sessão sozinho;
// ver src/domain/service-session/closing.ts). Idempotente de verdade
// (regra 18/19, mesmo padrão de createOrder): chave repetida devolve o
// pagamento já existente, nunca duplica.
export async function registerPayment(
  serviceSessionId: string,
  actorUserId: string,
  input: {
    paymentMethodId: string;
    amount?: string | number;
    idempotencyKey: string;
    guestId?: string;
    allocations?: z.infer<typeof allocationRequestSchema>[];
  },
) {
  const data = registerSchema.parse(input);
  if (!data.allocations?.length && data.amount === undefined) {
    throw new RegisterPaymentError("Informe o valor do pagamento.");
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return { payment: existing, created: false as const, session: null };

      const session = await tx.serviceSession.findUniqueOrThrow({
        where: { id: serviceSessionId },
      });

      if (!canRegisterPayment(session.status)) {
        throw new RegisterPaymentError("Este atendimento não está ativo para receber pagamento.");
      }

      const method = await tx.paymentMethod.findFirst({
        where: { id: data.paymentMethodId, restaurantId: session.restaurantId, active: true },
      });
      if (!method) throw new RegisterPaymentError("Forma de pagamento inválida ou inativa.");

      if (data.guestId) {
        const guest = await tx.guest.findFirst({
          where: { id: data.guestId, serviceSessionId },
        });
        if (!guest) throw new RegisterPaymentError("Esta pessoa não pertence a esta mesa.");
      }

      let amount: Prisma.Decimal;
      let resolvedAllocations: ResolvedAllocation[] = [];
      if (data.allocations?.length) {
        const { resolved, totalAmount } = await resolveAllocations(
          tx,
          serviceSessionId,
          data.allocations,
        );
        if (totalAmount.lessThanOrEqualTo(ZERO)) {
          throw new RegisterPaymentError("Selecione ao menos um item para pagar.");
        }
        resolvedAllocations = resolved;
        amount = totalAmount;
      } else {
        amount = toDecimal(data.amount!);
      }

      const balance = toDecimal(session.balanceAmount);
      if (amount.greaterThan(balance)) {
        throw new RegisterPaymentError(`Valor maior que o saldo restante (${balance.toFixed(2)}).`);
      }

      const payment = await tx.payment.create({
        data: {
          serviceSessionId,
          paymentMethodId: data.paymentMethodId,
          guestId: data.guestId,
          amount,
          idempotencyKey: data.idempotencyKey,
          registeredById: actorUserId,
        },
      });

      if (resolvedAllocations.length > 0) {
        await tx.paymentItemAllocation.createMany({
          data: resolvedAllocations.map((a) => ({
            paymentId: payment.id,
            orderItemId: a.orderItemId,
            kind: a.kind,
            quantity: a.quantity,
            shareNumerator: a.shareNumerator,
            shareDenominator: a.shareDenominator,
            amount: a.amount,
          })),
        });
      }

      await writeAuditLog(tx, {
        restaurantId: session.restaurantId,
        userId: actorUserId,
        tableId: session.tableId,
        action: "payment.registered",
        entityType: "Payment",
        entityId: payment.id,
        metadata: {
          amount: amount.toString(),
          paymentMethod: method.name,
          guestId: data.guestId ?? null,
          allocations: resolvedAllocations.map((a) => ({
            orderItemId: a.orderItemId,
            kind: a.kind,
            quantity: a.quantity,
            amount: a.amount.toString(),
          })),
        },
      });

      const activePayments = await tx.payment.findMany({
        where: { serviceSessionId, voidedAt: null },
      });
      const paidAmount = sumDecimals(activePayments.map((p) => p.amount));

      // Só recalcula os totais (saldo sobe/desce com consumo e pagamento,
      // sempre) — nunca mexe em ServiceSession.status/Table.status. Quem
      // decide fechar é requestClosing/closeTable, ações explícitas e
      // separadas (docs/product/business-rules.md §6). O rastreamento por
      // item (PaymentItemAllocation) é uma camada paralela, não muda em
      // nada esse cálculo.
      await recalculateSessionTotals(tx, serviceSessionId, {
        discountAmount: session.discountAmount,
        serviceChargeAmount: session.serviceChargeAmount,
        paidAmount,
      });

      return { payment, created: true as const, session };
    },
    { maxWait: 5000, timeout: 15000 },
  );

  if (result.created && result.session) {
    await runAfterResponse(() =>
      publishChange(sessionRealtimeChannels(result.session!), "service_session.payment_registered"),
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
// (voidedAt/voidReason), preservando o original. Também não mexe em
// status — só devolve o saldo (revisão 2026-08-10, mesmo racional de
// registerPayment). As PaymentItemAllocation deste pagamento voltam a
// contar como "em aberto" de graça: todo cálculo de aberto/pago por item
// filtra por payment.voidedAt: null, então não precisa apagar nem marcar
// nada nelas — o estorno do pagamento pai já basta.
export async function voidPayment(paymentId: string, actorUserId: string, reason: string) {
  const voidReason = voidSchema.parse(reason);

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { serviceSession: true },
    });

    if (payment.voidedAt) throw new RegisterPaymentError("Este pagamento já foi estornado.");

    await tx.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason, voidedById: actorUserId },
    });

    await writeAuditLog(tx, {
      restaurantId: payment.serviceSession.restaurantId,
      userId: actorUserId,
      tableId: payment.serviceSession.tableId,
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

    return payment.serviceSession;
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.payment_voided"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}
