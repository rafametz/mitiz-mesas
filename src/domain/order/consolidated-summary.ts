import { Prisma, type MeatPoint, type OrderItemStatus } from "@prisma/client";
import { sumDecimals, toDecimal } from "@/lib/money";
import { MEAT_POINT_LABELS } from "./labels";

export type ConsolidatedItemInput = {
  productId: string;
  productNameAtOrder: string;
  meatPoint: MeatPoint | null;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  status: OrderItemStatus;
  modifiers: {
    modifierNameAtOrder: string;
    priceDeltaAtOrder: Prisma.Decimal.Value;
    quantity: number;
  }[];
};

export type ConsolidatedLine = {
  key: string;
  label: string;
  quantity: number;
  lineTotal: Prisma.Decimal;
};

export type ConsolidatedSummary = {
  lines: ConsolidatedLine[];
  total: Prisma.Decimal;
};

// Junta itens "iguais" (mesmo produto + ponto da carne + mesmos adicionais)
// lançados em pedidos diferentes da mesma mesa numa única linha, com
// quantidade e valor somados — um totalizador tipo nota, pra o garçom saber
// o consumo total sem contar pedido por pedido (pedido do usuário sobre a
// tela da mesa).
//
// Mesmo critério de inclusão do subtotal oficial da comanda
// (recalculateSessionTotals em src/application/service-session/
// recalculate-totals.ts) — item CANCELLED não entra; CANCELLATION_REQUESTED
// ainda conta (só sai do total quando o cancelamento é de fato autorizado).
// Isso é o que garante que a soma desta tela bate com o "Subtotal" mostrado
// em outro lugar da mesma página.
export function buildConsolidatedSummary(items: ConsolidatedItemInput[]): ConsolidatedSummary {
  const groups = new Map<string, { label: string; quantity: number; lineTotal: Prisma.Decimal }>();

  for (const item of items) {
    if (item.status === "CANCELLED") continue;

    const modifierKey = item.modifiers
      .map((m) => m.modifierNameAtOrder)
      .sort()
      .join(",");
    const key = `${item.productId}|${item.meatPoint ?? ""}|${modifierKey}`;

    const modifiersTotal = sumDecimals(
      item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
    );
    const lineTotal = toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);

    const meatPointLabel =
      item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
        ? ` (${MEAT_POINT_LABELS[item.meatPoint]})`
        : "";
    const modifierLabel =
      item.modifiers.length > 0
        ? ` + ${item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}`
        : "";

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal = existing.lineTotal.add(lineTotal);
    } else {
      groups.set(key, {
        label: `${item.productNameAtOrder}${meatPointLabel}${modifierLabel}`,
        quantity: item.quantity,
        lineTotal,
      });
    }
  }

  const lines = [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const total = sumDecimals(lines.map((line) => line.lineTotal));

  return { lines, total };
}
