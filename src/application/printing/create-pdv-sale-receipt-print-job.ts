import "server-only";
import { prisma } from "@/lib/prisma";
import {
  buildPdvSaleReceiptContent,
  type PdvSaleReceiptOrigin,
} from "@/domain/printing/pdv-sale-receipt";
import { buildConsolidatedSummary } from "@/domain/order/consolidated-summary";
import { MEAT_POINT_LABELS } from "@/domain/order/labels";
import { bareTableNumber } from "@/domain/table/labels";
import { formatBRL, sumDecimals, toDecimal } from "@/lib/money";
import type { Prisma } from "@prisma/client";

export class PdvSaleReceiptError extends Error {}

type CashReceivedByIdempotencyKey = Record<string, string>;

function buildPaymentLine(
  payment: { amount: Prisma.Decimal; idempotencyKey: string; paymentMethod: { name: string } },
  cashReceivedByIdempotencyKey: CashReceivedByIdempotencyKey,
) {
  const receivedRaw = cashReceivedByIdempotencyKey[payment.idempotencyKey];
  const received = receivedRaw ? toDecimal(receivedRaw) : null;
  const change =
    received && received.greaterThan(payment.amount) ? received.minus(payment.amount) : null;
  return {
    methodName: payment.paymentMethod.name,
    amount: formatBRL(payment.amount),
    change: change ? formatBRL(change) : null,
  };
}

// Recibo de venda do PDV (Módulo 17 — Fase 2 do roadmap MITIZ Gestão; ADR
// 0010 — Pagamento Combinado). Chamado depois que `sellPdv`/
// `registerCombinedCheckout` já confirmaram a venda (efeito colateral não
// crítico, agendado via runAfterResponse pelo chamador, mesmo racional de
// createPrintJobsForOrder) — relê o estado já gravado em vez de confiar
// no que o cliente mandou, exceto o valor "recebido em dinheiro" (só
// existe na tela, nunca gravado em `Payment` por decisão do usuário —
// ver docs/product/visao-mitiz-gestao.md, Fase 2), repassado aqui só para
// calcular o troco impresso.
export async function createPdvSaleReceiptPrintJob(
  pdvSessionId: string,
  cashReceivedByIdempotencyKey: CashReceivedByIdempotencyKey = {},
) {
  const pdvSession = await prisma.serviceSession.findUnique({
    where: { id: pdvSessionId },
    include: {
      restaurant: true,
      waiter: true,
      orders: { include: { items: { include: { modifiers: true } } } },
      payments: {
        where: { voidedAt: null },
        orderBy: { createdAt: "asc" },
        include: { paymentMethod: true },
      },
    },
  });
  if (!pdvSession) {
    throw new PdvSaleReceiptError("Venda não encontrada.");
  }

  const consolidated = buildConsolidatedSummary(
    pdvSession.orders.flatMap((order) =>
      order.items.map((item) => ({
        productId: item.productId,
        productNameAtOrder: item.productNameAtOrder,
        meatPoint: item.meatPoint,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: item.status,
        weightQuantity: item.weightQuantity,
        modifiers: item.modifiers.map((m) => ({
          modifierNameAtOrder: m.modifierNameAtOrder,
          priceDeltaAtOrder: m.priceDeltaAtOrder,
          quantity: m.quantity,
        })),
      })),
    ),
  );

  const lojaOrigin: PdvSaleReceiptOrigin = {
    label: "Loja",
    items: consolidated.lines.map((line) => ({
      // Venda por peso (balança, 2026-11-07): mostra o peso lançado em vez
      // da contagem ("1x"), que não diria nada sobre o que foi vendido.
      label: line.weightQuantity
        ? `${line.weightQuantity.toFixed(3).replace(".", ",")} kg ${line.label}`
        : `${line.quantity}x ${line.label}`,
      amount: formatBRL(line.lineTotal),
    })),
    subtotal: formatBRL(pdvSession.totalAmount),
    payments: pdvSession.payments.map((p) => buildPaymentLine(p, cashReceivedByIdempotencyKey)),
  };

  // Pagamento Combinado (ADR 0010): esta venda tem um `combinedCheckoutId`
  // em comum com um Payment de uma mesa — busca o irmão pra discriminar
  // as duas origens no mesmo recibo, nunca misturando numa linha só.
  const combinedCheckoutId = pdvSession.payments.find(
    (p) => p.combinedCheckoutId,
  )?.combinedCheckoutId;

  let mesaOrigin: PdvSaleReceiptOrigin | null = null;
  let mesaTotal = toDecimal(0);
  if (combinedCheckoutId) {
    const mesaPayment = await prisma.payment.findFirst({
      where: { combinedCheckoutId, serviceSessionId: { not: pdvSessionId }, voidedAt: null },
      include: {
        paymentMethod: true,
        serviceSession: { include: { table: true } },
        allocations: { include: { orderItem: { include: { modifiers: true } } } },
      },
    });
    if (mesaPayment) {
      mesaTotal = toDecimal(mesaPayment.amount);
      mesaOrigin = {
        label: `Mesa ${bareTableNumber(mesaPayment.serviceSession.table?.number ?? "")}`,
        items: mesaPayment.allocations.map((allocation) => {
          const item = allocation.orderItem;
          const meatPointLabel =
            item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
              ? ` (${MEAT_POINT_LABELS[item.meatPoint]})`
              : "";
          const modifierLabel =
            item.modifiers.length > 0
              ? ` + ${item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}`
              : "";
          const baseLabel = `${item.productNameAtOrder}${meatPointLabel}${modifierLabel}`;
          const label =
            allocation.kind === "UNITS" && allocation.quantity
              ? `${allocation.quantity}x ${baseLabel}`
              : baseLabel;
          return { label, amount: formatBRL(allocation.amount) };
        }),
        subtotal: formatBRL(mesaPayment.amount),
        payments: [buildPaymentLine(mesaPayment, cashReceivedByIdempotencyKey)],
      };
    }
  }

  const origins = mesaOrigin ? [mesaOrigin, lojaOrigin] : [lojaOrigin];
  const total = formatBRL(sumDecimals([mesaTotal, pdvSession.totalAmount]));

  const printer = await prisma.printer.findFirst({
    where: { restaurantId: pdvSession.restaurantId, active: true },
  });

  const content = buildPdvSaleReceiptContent({
    restaurantName: pdvSession.restaurant.name,
    waiterName: pdvSession.waiter.name,
    origins,
    total,
  });

  const job = await prisma.printJob.create({
    data: {
      serviceSessionId: pdvSession.id,
      printerId: printer?.id,
      type: "PDV_SALE",
      contentSnapshot: content,
    },
  });

  return { job, printerConfigured: printer !== null };
}
