import "server-only";
import type { OrderItemStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransitionOrderItem, deriveOrderProgressStatus } from "@/domain/order/states";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, sectorChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

// Erro de negócio (transição inválida — item já avançou/foi cancelado por
// outra tela enquanto esta estava aberta) — distinto de erro inesperado,
// mesmo racional de OpenTableError/CreateOrderError/CancelOrderItemError.
export class UpdateItemStatusError extends Error {}

// Avança um item de pedido na esteira de produção (Módulo 6 — CLAUDE.md
// seção 5, "Produção"): SENT → IN_PREPARATION → READY → DELIVERED. Não
// verifica permissão (isso é responsabilidade da server action que chama
// esta função — mesmo padrão de openTable/createOrder/cancelOrderItem).
//
// Item não tem status "recebido" próprio (CLAUDE.md seção 7) — a primeira
// vez que algum item do pedido sai de SENT, o *pedido* passa a RECEIVED
// (ver deriveOrderProgressStatus): "marcar como recebido" (seção 5) é um
// efeito colateral de começar a preparar o primeiro item, não uma ação à
// parte.
export async function updateOrderItemStatus(orderItemId: string, toStatus: OrderItemStatus) {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
      include: {
        order: { include: { serviceSession: { include: { table: true } } } },
      },
    });

    if (!canTransitionOrderItem(item.status, toStatus)) {
      throw new UpdateItemStatusError("Este item não pode mudar para esse status agora.");
    }

    const updatedItem = await tx.orderItem.update({
      where: { id: orderItemId },
      data: { status: toStatus },
    });

    const siblingItems = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
    const newOrderStatus = deriveOrderProgressStatus(
      item.order.status,
      siblingItems.map((i) => i.status),
    );
    if (newOrderStatus !== item.order.status) {
      await tx.order.update({ where: { id: item.orderId }, data: { status: newOrderStatus } });
    }

    return {
      updatedItem,
      tableId: item.order.serviceSession.tableId,
      restaurantId: item.order.serviceSession.table.restaurantId,
      sectorId: item.sectorId,
    };
  });

  const channels = [
    tableChannel(result.tableId),
    restaurantTablesChannel(result.restaurantId),
    sectorChannel(result.sectorId),
  ];
  await runAfterResponse(() => publishChange(channels, "order_item.status_changed"));

  return result.updatedItem;
}
