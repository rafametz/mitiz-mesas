import "server-only";
import { z } from "zod";
import type { DiscountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "./recalculate-totals";
import { canModifyClosingCharges } from "@/domain/service-session/closing";
import { clampDecimal, toDecimal, ZERO } from "@/lib/money";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class ApplyDiscountError extends Error {}

const applySchema = z.object({
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  value: z.coerce.number().positive("Informe um valor de desconto maior que zero."),
  reason: z.string().trim().min(3, "Informe o motivo do desconto (mínimo 3 caracteres).").max(300),
});

// Desconto sem limite pro Caixa neste MVP (decisão confirmada com o
// usuário — a diferenciação "Caixa aplica limitado" de
// business-rules.md §7 fica pra quando houver necessidade real de travar
// um teto; hoje Caixa e Admin têm o mesmo alcance, ambos exigem
// DISCOUNTS_APPLY na camada de servidor).
//
// Só um desconto ativo por vez (regra 14/17: cada um registra tipo, valor,
// motivo, autor) — pra trocar, anula o atual (voidDiscount) e aplica outro.
export async function applyDiscount(
  serviceSessionId: string,
  actorUserId: string,
  input: { type: DiscountType; value: string | number; reason: string },
) {
  const data = applySchema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.serviceSession.findUniqueOrThrow({
      where: { id: serviceSessionId },
    });

    if (!canModifyClosingCharges(session.status)) {
      throw new ApplyDiscountError("Solicite o fechamento antes de aplicar um desconto.");
    }

    const existingActive = await tx.discount.findFirst({
      where: { serviceSessionId, voidedAt: null },
    });
    if (existingActive) {
      throw new ApplyDiscountError(
        "Já existe um desconto ativo nesta comanda. Anule antes de aplicar outro.",
      );
    }

    const subtotal = toDecimal(session.subtotalAmount);
    const rawValue = toDecimal(data.value);
    // Nunca deixa o desconto passar do subtotal, mesmo digitado errado
    // (regra 20/21 — nunca gerar saldo negativo por causa disso).
    const amountApplied = clampDecimal(
      data.type === "PERCENTAGE" ? subtotal.mul(rawValue).div(100) : rawValue,
      ZERO,
      subtotal,
    );

    const discount = await tx.discount.create({
      data: {
        serviceSessionId,
        type: data.type,
        value: rawValue,
        amountApplied,
        reason: data.reason,
        appliedById: actorUserId,
      },
    });

    await writeAuditLog(tx, {
      restaurantId: session.restaurantId,
      userId: actorUserId,
      tableId: session.tableId,
      action: "discount.applied",
      entityType: "Discount",
      entityId: discount.id,
      metadata: {
        type: data.type,
        value: rawValue.toString(),
        amountApplied: amountApplied.toString(),
        reason: data.reason,
      },
    });

    await recalculateSessionTotals(tx, serviceSessionId, {
      discountAmount: amountApplied,
      serviceChargeAmount: session.serviceChargeAmount,
      paidAmount: session.paidAmount,
    });

    return session;
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.discount_applied"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}

const voidSchema = z
  .string()
  .trim()
  .min(3, "Informe o motivo da anulação (mínimo 3 caracteres).")
  .max(300);

// Nunca apaga o desconto (regra 8/17, mesmo racional de Payment) — marca
// anulado, preservando o registro original.
export async function voidDiscount(discountId: string, actorUserId: string, reason: string) {
  const voidReason = voidSchema.parse(reason);

  const result = await prisma.$transaction(async (tx) => {
    const discount = await tx.discount.findUniqueOrThrow({
      where: { id: discountId },
      include: { serviceSession: true },
    });

    if (discount.voidedAt) {
      throw new ApplyDiscountError("Este desconto já foi anulado.");
    }

    await tx.discount.update({
      where: { id: discountId },
      data: { voidedAt: new Date(), voidReason },
    });

    await writeAuditLog(tx, {
      restaurantId: discount.serviceSession.restaurantId,
      userId: actorUserId,
      tableId: discount.serviceSession.tableId,
      action: "discount.voided",
      entityType: "Discount",
      entityId: discount.id,
      metadata: { reason: voidReason },
    });

    await recalculateSessionTotals(tx, discount.serviceSessionId, {
      discountAmount: ZERO,
      serviceChargeAmount: discount.serviceSession.serviceChargeAmount,
      paidAmount: discount.serviceSession.paidAmount,
    });

    return discount.serviceSession;
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.discount_voided"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}
