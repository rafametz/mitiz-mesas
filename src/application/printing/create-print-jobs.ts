import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildTicketContent, type TicketItem } from "@/domain/printing/ticket";
import { MEAT_POINT_LABELS } from "@/domain/order/labels";

type OrderWithItemsForPrint = Prisma.OrderGetPayload<{
  include: { items: { include: { modifiers: true; guest: true } } };
}>;

// Aceita tanto um client de transação quanto o singleton normal —
// desde a Fase 2 da otimização de performance (docs/performance/
// optimization-plan.md), isto roda DEPOIS do pedido já ter sido
// confirmado ao garçom (via after(), não mais dentro da transação
// Serializable de createOrder), então na prática sempre recebe o
// singleton; o tipo continua aceitando um tx também para não quebrar
// cancel-order-item.ts, que ainda cria o PrintJob de cancelamento
// dentro da própria transação (esse caso é mais raro e menor).
type Db = Prisma.TransactionClient | PrismaClient;

// Cria um PrintJob por setor presente no pedido (docs/printing/
// architecture.md — "Setor" é campo único no ticket, não lista, então cada
// setor sai num ticket separado, ainda que todos imprimam na mesma
// impressora física por enquanto).
export async function createPrintJobsForOrder(
  tx: Db,
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

  // Setores são independentes entre si (cada PrintJob é uma linha própria,
  // sem restrição compartilhada) — cria em paralelo em vez de um de cada
  // vez, já que isto não está mais dentro da transação principal do
  // pedido e não precisa mais ser sequencial por segurança.
  await Promise.all(
    sectorIds.map((sectorId) => {
      const sectorItems = activeItems.filter((item) => item.sectorId === sectorId);
      const ticketItems: TicketItem[] = sectorItems.map((item) => ({
        productName: item.productNameAtOrder,
        quantity: item.quantity,
        meatPointLabel:
          item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
            ? MEAT_POINT_LABELS[item.meatPoint]
            : null,
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

      return tx.printJob.create({
        data: {
          orderId: params.order.id,
          sectorId,
          printerId: printer?.id,
          type,
          contentSnapshot: content,
        },
      });
    }),
  );
}
