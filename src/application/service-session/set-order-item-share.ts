import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { sessionRealtimeChannels } from "./session-realtime";
import { publishChange } from "@/lib/realtime/publish";
import { runAfterResponse } from "@/lib/run-after-response";
import { openAmountForItem, type PayableOrderItemInput } from "@/domain/payment/item-allocation";
import { ZERO } from "@/lib/money";

export class SetOrderItemShareError extends Error {}

// "Dividir item" / "Redistribuir" (2026-08-15, ADR 0006) — grava em quantas
// partes o SALDO ABERTO atual de um item compartilhado está dividido
// agora. Pode ser chamada de novo a qualquer momento pra redividir o que
// ainda está aberto (regra confirmada com o usuário: pagamentos já
// registrados guardam seu próprio snapshot em PaymentItemAllocation e
// nunca são recalculados por isso). null remove a divisão (item volta a
// ser "normal": pagar inteiro ou valor personalizado).
//
// v1 (escopo confirmado com o usuário 2026-08-15): só item lançado com
// quantity = 1. Dividir entre várias porções iguais na mesma mesa (ex.: 3
// porções de fritas, dividir entre todos) fica pra uma v2 — ver backlog.
const partsSchema = z.union([z.literal(null), z.coerce.number().int().min(1).max(20)]);

export async function setOrderItemShareParts(orderItemId: string, actorUserId: string, parts: number | null) {
  const value = partsSchema.parse(parts);

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      include: {
        modifiers: true,
        guest: true,
        allocations: { include: { payment: { select: { voidedAt: true } } } },
        order: { include: { serviceSession: true } },
      },
    });

    if (item.status === "CANCELLED") {
      throw new SetOrderItemShareError("Este item foi cancelado.");
    }
    if (item.quantity !== 1) {
      throw new SetOrderItemShareError(
        "Só é possível dividir um item lançado com quantidade 1 nesta versão.",
      );
    }

    const payable: PayableOrderItemInput = {
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

    if (value !== null && openAmountForItem(payable).lessThanOrEqualTo(ZERO)) {
      throw new SetOrderItemShareError("Este item já está totalmente pago.");
    }

    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { openShareParts: value },
    });

    await writeAuditLog(tx, {
      restaurantId: item.order.serviceSession.restaurantId,
      userId: actorUserId,
      tableId: item.order.serviceSession.tableId,
      action: value === null ? "order_item.share_removed" : "order_item.share_updated",
      entityType: "OrderItem",
      entityId: item.id,
      metadata: { previousParts: item.openShareParts, parts: value },
    });

    return { session: item.order.serviceSession };
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result.session), "service_session.item_share_updated"),
  );

  return { restaurantId: result.session.restaurantId, tableId: result.session.tableId };
}
