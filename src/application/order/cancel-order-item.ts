import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "@/application/service-session/recalculate-totals";
import { canTransitionOrderItem, deriveOrderStatus } from "@/domain/order/states";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";

export class CancelOrderItemError extends Error {}

const reasonSchema = z.string().trim().min(3, "Informe um motivo (mínimo 3 caracteres)").max(300);

// Compartilhado pelas duas etapas do fluxo de cancelamento (CLAUDE.md
// seção 5 — Garçom solicita, Admin autoriza). Nunca apaga o item (regra
// 7); sempre grava auditoria (regra 6/22); recalcula o total da comanda
// só quando o item de fato sai do cálculo (CANCELLED).
async function transitionItem(params: {
  orderItemId: string;
  toStatus: "CANCELLATION_REQUESTED" | "CANCELLED";
  actorUserId: string;
  reason: string;
  auditAction: string;
}) {
  const reason = reasonSchema.parse(params.reason);

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: params.orderItemId },
      include: {
        order: { include: { serviceSession: { include: { table: true } } } },
      },
    });

    if (!canTransitionOrderItem(item.status, params.toStatus)) {
      throw new CancelOrderItemError(
        params.toStatus === "CANCELLED"
          ? "Este item não pode ser cancelado no status atual."
          : "Este item não pode ter cancelamento solicitado no status atual.",
      );
    }

    const updateData: Prisma.OrderItemUpdateInput =
      params.toStatus === "CANCELLED"
        ? {
            status: "CANCELLED",
            cancelReason: reason,
            cancelledAt: new Date(),
            cancelledBy: { connect: { id: params.actorUserId } },
          }
        : { status: "CANCELLATION_REQUESTED" };

    const updatedItem = await tx.orderItem.update({
      where: { id: params.orderItemId },
      data: updateData,
    });

    await writeAuditLog(tx, {
      restaurantId: item.order.serviceSession.table.restaurantId,
      userId: params.actorUserId,
      action: params.auditAction,
      entityType: "OrderItem",
      entityId: item.id,
      metadata: { reason, fromStatus: item.status, toStatus: params.toStatus },
    });

    // Mantém Order.status (rollup) consistente com o conjunto de itens.
    const siblingItems = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
    const newOrderStatus = deriveOrderStatus(
      item.order.status,
      siblingItems.map((i) => i.status),
    );
    if (newOrderStatus !== item.order.status) {
      await tx.order.update({ where: { id: item.orderId }, data: { status: newOrderStatus } });
    }

    if (params.toStatus === "CANCELLED") {
      await recalculateSessionTotals(tx, item.order.serviceSessionId);
    }

    return {
      updatedItem,
      tableId: item.order.serviceSession.tableId,
      restaurantId: item.order.serviceSession.table.restaurantId,
    };
  });

  await publishChange(
    [tableChannel(result.tableId), restaurantTablesChannel(result.restaurantId)],
    params.toStatus === "CANCELLED" ? "order_item.cancelled" : "order_item.cancellation_requested",
  );

  return result.updatedItem;
}

// Garçom (ORDERS_CANCEL_REQUEST) pede o cancelamento — item ainda conta
// no total até ser efetivamente cancelado.
export async function requestCancelOrderItem(
  orderItemId: string,
  actorUserId: string,
  reason: string,
) {
  return transitionItem({
    orderItemId,
    toStatus: "CANCELLATION_REQUESTED",
    actorUserId,
    reason,
    auditAction: "order_item.cancellation_requested",
  });
}

// Admin (ORDERS_CANCEL_AUTHORIZE) autoriza — cancela de fato. Pode partir
// direto de SENT/IN_PREPARATION/READY, sem passar pela solicitação.
export async function authorizeCancelOrderItem(
  orderItemId: string,
  actorUserId: string,
  reason: string,
) {
  return transitionItem({
    orderItemId,
    toStatus: "CANCELLED",
    actorUserId,
    reason,
    auditAction: "order_item.cancelled",
  });
}
