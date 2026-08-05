import "server-only";
import type { Prisma } from "@prisma/client";
import { buildTicketContent, type TicketItem } from "@/domain/printing/ticket";
import { MEAT_POINT_LABELS } from "@/domain/order/labels";

type OrderWithItemsForPrint = Prisma.OrderGetPayload<{
  include: { items: { include: { modifiers: true; guest: true } } };
}>;

// Cria um PrintJob por setor presente no pedido (docs/printing/
// architecture.md — "Setor" é campo único no ticket, não lista, então cada
// setor sai num ticket separado, ainda que todos imprimam na mesma
// impressora física por enquanto). Roda dentro da mesma transação de
// createOrder — se o pedido não for criado, o job de impressão também não.
export async function createPrintJobsForOrder(
  tx: Prisma.TransactionClient,
  params: {
    order: OrderWithItemsForPrint;
    restaurantId: string;
    restaurantName: string;
    tableNumber: string;
    waiterName: string;
  },
) {
  const activeItems = params.order.items;
  if (activeItems.length === 0) return;

  const sectorIds = [...new Set(activeItems.map((item) => item.sectorId))];
  const [sectors, printer] = await Promise.all([
    tx.productionSector.findMany({ where: { id: { in: sectorIds } } }),
    tx.printer.findFirst({ where: { restaurantId: params.restaurantId, active: true } }),
  ]);
  const sectorNameById = new Map(sectors.map((s) => [s.id, s.name]));

  // Primeiro pedido do atendimento é "novo"; os seguintes na mesma mesa
  // são "complemento" — mesmo formato de ticket, tipo diferente impresso
  // nele (docs/printing/architecture.md).
  const type = params.order.sequenceNumber === 1 ? "NEW_ORDER" : "COMPLEMENT";

  for (const sectorId of sectorIds) {
    const sectorItems = activeItems.filter((item) => item.sectorId === sectorId);
    const ticketItems: TicketItem[] = sectorItems.map((item) => ({
      productName: item.productNameAtOrder,
      quantity: item.quantity,
      meatPointLabel:
        item.meatPoint && item.meatPoint !== "NAO_SE_APLICA" ? MEAT_POINT_LABELS[item.meatPoint] : null,
      modifiers: item.modifiers.map((m) => m.modifierNameAtOrder),
      notes: item.notes,
      guestName: item.guest?.name ?? null,
    }));

    const content = buildTicketContent({
      type,
      restaurantName: params.restaurantName,
      tableNumber: params.tableNumber,
      waiterName: params.waiterName,
      sectorName: sectorNameById.get(sectorId) ?? "Setor",
      orderSequenceNumber: params.order.sequenceNumber,
      items: ticketItems,
    });

    await tx.printJob.create({
      data: {
        orderId: params.order.id,
        sectorId,
        printerId: printer?.id,
        type,
        contentSnapshot: content,
      },
    });
  }
}
