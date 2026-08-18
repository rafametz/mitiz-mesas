import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { sessionRealtimeChannels } from "./session-realtime";
import { publishChange } from "@/lib/realtime/publish";
import { runAfterResponse } from "@/lib/run-after-response";
import { openAmountForItem, type PayableOrderItemInput } from "@/domain/payment/item-allocation";
import { sumDecimals, ZERO } from "@/lib/money";

export class SetOrderItemShareError extends Error {}

// "Dividir" / "Redistribuir" (2026-08-15, revisado 2026-08-16 — pedido do
// usuário: dividir passou a ser uma propriedade do GRUPO inteiro, não só
// de um item isolado com quantidade 1. Ex.: 2 porções de linguiça
// lançadas em pedidos diferentes, dividir as duas juntas entre 4
// pessoas). Grava o mesmo valor de `openShareParts` em TODAS as linhas
// do grupo (pode ser 1 ou mais `OrderItem`) de uma vez, dentro da mesma
// transação — é o saldo aberto SOMADO entre elas que fica dividido, não
// cada uma isoladamente. Pode ser chamada de novo a qualquer momento pra
// redividir o que ainda está aberto (regra confirmada com o usuário:
// pagamentos já registrados guardam seu próprio snapshot em
// PaymentItemAllocation e nunca são recalculados por isso). null remove a
// divisão (item volta a ser "normal": pagar inteiro, selecionar unidades
// ou valor personalizado).
const partsSchema = z.union([z.literal(null), z.coerce.number().int().min(1).max(20)]);

export async function setOrderItemShareParts(
  orderItemIds: string[],
  actorUserId: string,
  parts: number | null,
) {
  if (orderItemIds.length === 0) {
    throw new SetOrderItemShareError("Nenhum item selecionado para dividir.");
  }
  const value = partsSchema.parse(parts);

  const result = await prisma.$transaction(async (tx) => {
    const items = await tx.orderItem.findMany({
      where: { id: { in: orderItemIds } },
      include: {
        modifiers: true,
        guest: true,
        allocations: { include: { payment: { select: { voidedAt: true } } } },
        order: { include: { serviceSession: true } },
      },
    });

    if (items.length !== orderItemIds.length) {
      throw new SetOrderItemShareError("Um dos itens selecionados não foi encontrado.");
    }
    if (items.some((item) => item.status === "CANCELLED")) {
      throw new SetOrderItemShareError("Um dos itens selecionados foi cancelado.");
    }

    const payableItems: PayableOrderItemInput[] = items.map((item) => ({
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
      openShareBaseAmount: item.openShareBaseAmount,
      createdAt: item.createdAt,
      allocations: item.allocations.map((a) => ({
        kind: a.kind,
        quantity: a.quantity,
        amount: a.amount,
        voided: a.payment.voidedAt !== null,
      })),
    }));

    // Base fixa do rateio (revisão 2026-08-18): sempre o saldo aberto do
    // grupo NO MOMENTO desta chamada, gravada junto com openShareParts.
    // Toda vez que "Dividir"/"Redistribuir" é acionado de novo, essa base
    // é recalculada a partir do saldo aberto atual — é assim que uma
    // redistribuição de propósito muda o valor da parte; entre uma
    // chamada e outra, o valor da parte fica fixo mesmo com pagamentos
    // parciais reduzindo o saldo aberto.
    const groupOpenAmount = sumDecimals(payableItems.map((item) => openAmountForItem(item)));
    if (value !== null && groupOpenAmount.lessThanOrEqualTo(ZERO)) {
      throw new SetOrderItemShareError("Este item já está totalmente pago.");
    }

    await tx.orderItem.updateMany({
      where: { id: { in: orderItemIds } },
      data: { openShareParts: value, openShareBaseAmount: value !== null ? groupOpenAmount : null },
    });

    const session = items[0]!.order.serviceSession;
    await writeAuditLog(tx, {
      restaurantId: session.restaurantId,
      userId: actorUserId,
      tableId: session.tableId,
      action: value === null ? "order_item.share_removed" : "order_item.share_updated",
      entityType: "OrderItem",
      entityId: items[0]!.id,
      metadata: {
        orderItemIds,
        previousParts: items.map((i) => i.openShareParts),
        previousBaseAmount: items.map((i) => i.openShareBaseAmount?.toString() ?? null),
        parts: value,
        baseAmount: value !== null ? groupOpenAmount.toString() : null,
      },
    });

    return { session };
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result.session), "service_session.item_share_updated"),
  );

  return { restaurantId: result.session.restaurantId, tableId: result.session.tableId };
}
