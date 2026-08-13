import { Prisma, type OrderItemStatus } from "@prisma/client";
import { sumDecimals, toDecimal } from "@/lib/money";

// Módulo 11 — "vendas por produto": ranking de produto por faturamento no
// período, através de todas as mesas/atendimentos (diferente de
// consolidated-summary.ts, que junta itens de UMA comanda por produto +
// ponto da carne + adicionais; aqui é só por produto, através de vários
// atendimentos — granularidade mais grossa de propósito, é um ranking, não
// uma comanda).

export type ItemForProductReport = {
  productId: string;
  productNameAtOrder: string;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  status: OrderItemStatus;
  modifiers: { priceDeltaAtOrder: Prisma.Decimal.Value; quantity: number }[];
};

export type ProductSalesLine = {
  productId: string;
  productName: string;
  quantity: number;
  total: Prisma.Decimal;
};

// Mesmo critério de inclusão do subtotal oficial da comanda: item
// CANCELLED nunca entra (CANCELLATION_REQUESTED ainda conta, só sai
// quando o cancelamento é de fato autorizado).
export function buildSalesByProduct(items: ItemForProductReport[]): {
  lines: ProductSalesLine[];
  total: Prisma.Decimal;
} {
  const byProduct = new Map<
    string,
    { productName: string; quantity: number; total: Prisma.Decimal }
  >();

  for (const item of items) {
    if (item.status === "CANCELLED") continue;

    const modifiersTotal = sumDecimals(
      item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
    );
    const lineTotal = toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);

    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.total = existing.total.add(lineTotal);
    } else {
      byProduct.set(item.productId, {
        productName: item.productNameAtOrder,
        quantity: item.quantity,
        total: lineTotal,
      });
    }
  }

  const lines = [...byProduct.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    // Decimal.comparedTo (não subtração + toNumber) — nunca ponto
    // flutuante pra comparar dinheiro (CLAUDE.md regra 20/21).
    .sort((a, b) => b.total.comparedTo(a.total));

  return { lines, total: sumDecimals(lines.map((l) => l.total)) };
}
