import "server-only";
import { prisma } from "@/lib/prisma";
import { buildBillSummaryContent } from "@/domain/printing/bill-summary";
import { buildConsolidatedSummary } from "@/domain/order/consolidated-summary";
import { splitEqually } from "@/domain/service-session/split";
import { formatBRL } from "@/lib/money";

export class BillSummaryPrintError extends Error {}

// "Imprimir conferência" (CLAUDE.md seção 10) — ao contrário dos tickets de
// pedido, não roda dentro de nenhuma transação maior nem é adiado com
// runAfterResponse: é a própria ação principal do clique, só lê o estado
// atual (pedidos, pagamentos) e grava um PrintJob novo, sem mexer em mais
// nada. Se não houver impressora cadastrada, o job é criado mesmo assim
// (mesmo comportamento de createPrintJobsForOrder) — fica visível em
// /impressao, só não é puxado por nenhum agente até alguém cadastrar uma
// impressora.
export async function createBillSummaryPrintJob(serviceSessionId: string) {
  const session = await prisma.serviceSession.findUnique({
    where: { id: serviceSessionId },
    include: {
      table: { include: { restaurant: true } },
      waiter: true,
      orders: {
        include: { items: { include: { modifiers: true } } },
      },
      payments: {
        where: { voidedAt: null },
        orderBy: { createdAt: "asc" },
        include: { paymentMethod: true, guest: true },
      },
    },
  });
  if (!session) {
    throw new BillSummaryPrintError("Atendimento não encontrado.");
  }

  const consolidated = buildConsolidatedSummary(
    session.orders.flatMap((order) =>
      order.items.map((item) => ({
        productId: item.productId,
        productNameAtOrder: item.productNameAtOrder,
        meatPoint: item.meatPoint,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: item.status,
        modifiers: item.modifiers.map((m) => ({
          modifierNameAtOrder: m.modifierNameAtOrder,
          priceDeltaAtOrder: m.priceDeltaAtOrder,
          quantity: m.quantity,
        })),
      })),
    ),
  );

  const perPersonShares = splitEqually(session.totalAmount, session.guestCount).map(formatBRL);

  const printer = await prisma.printer.findFirst({
    where: { restaurantId: session.table.restaurantId, active: true },
  });

  const content = buildBillSummaryContent({
    restaurantName: session.table.restaurant.name,
    tableNumber: session.table.number,
    waiterName: session.waiter.name,
    items: consolidated.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      lineTotal: formatBRL(line.lineTotal),
    })),
    subtotal: formatBRL(session.subtotalAmount),
    serviceCharge: session.serviceChargeAmount.greaterThan(0)
      ? formatBRL(session.serviceChargeAmount)
      : null,
    discount: session.discountAmount.greaterThan(0) ? formatBRL(session.discountAmount) : null,
    total: formatBRL(session.totalAmount),
    guestCount: session.guestCount,
    perPersonShares,
    payments: session.payments.map((payment) => ({
      methodName: payment.paymentMethod.name,
      amount: formatBRL(payment.amount),
      guestName: payment.guest?.name ?? null,
    })),
    paidAmount: formatBRL(session.paidAmount),
    balance: formatBRL(session.balanceAmount),
  });

  const job = await prisma.printJob.create({
    data: {
      serviceSessionId: session.id,
      printerId: printer?.id,
      type: "BILL_SUMMARY",
      contentSnapshot: content,
    },
  });

  return { job, printerConfigured: printer !== null };
}
