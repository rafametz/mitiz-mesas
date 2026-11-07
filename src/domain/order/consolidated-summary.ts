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
  // Venda por peso no PDV (balança, 2026-11-07) — opcional, de propósito:
  // mesa/retirada nunca preenchem isto, e todo chamador existente (resumo
  // da comanda, conferência da mesa) continua passando objetos sem esta
  // chave, sem precisar mudar nada. Presente só quando o item veio de uma
  // pesagem (hoje só o recibo de venda do PDV lê de volta).
  weightQuantity?: Prisma.Decimal.Value | null;
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
  // lineTotal / quantity — produto + adicionais já embutidos, já que a
  // linha só agrupa itens com exatamente os mesmos adicionais (chave do
  // grupo). Pedido do usuário 2026-08-13: resumo impresso da comanda
  // mostra valor unitário além do total da linha.
  unitPrice: Prisma.Decimal;
  // Soma do peso dos itens do grupo (null quando nenhum item do grupo
  // tinha peso) — produto por quilo sempre agrupa só com ele mesmo
  // (productId já é parte da chave), então nunca mistura item com peso e
  // sem peso na mesma linha.
  weightQuantity: Prisma.Decimal | null;
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
  const groups = new Map<
    string,
    { label: string; quantity: number; lineTotal: Prisma.Decimal; weightQuantity: Prisma.Decimal | null }
  >();

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

    const itemWeight = item.weightQuantity != null ? toDecimal(item.weightQuantity) : null;

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal = existing.lineTotal.add(lineTotal);
      if (itemWeight) {
        existing.weightQuantity = (existing.weightQuantity ?? toDecimal(0)).add(itemWeight);
      }
    } else {
      groups.set(key, {
        label: `${item.productNameAtOrder}${meatPointLabel}${modifierLabel}`,
        quantity: item.quantity,
        lineTotal,
        weightQuantity: itemWeight,
      });
    }
  }

  const lines = [...groups.entries()]
    .map(([key, group]) => ({ key, ...group, unitPrice: group.lineTotal.div(group.quantity) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const total = sumDecimals(lines.map((line) => line.lineTotal));

  return { lines, total };
}
