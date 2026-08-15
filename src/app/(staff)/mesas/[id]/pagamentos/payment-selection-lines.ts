import type { PayableLine } from "@/domain/payment/item-allocation";

// Conversão pra props de client component (2026-08-15): Decimal não
// atravessa o limite servidor/cliente do Next.js, e não precisamos da
// precisão dele aqui, é só exibição de um carrinho que o servidor sempre
// revalida antes de gravar qualquer coisa (CLAUDE.md regra 24, mesmo
// racional de estimatedLineTotal em new-order-form.tsx). Centavos
// inteiros, não `number` de reais, pra somar o carrinho sem acumular erro
// de ponto flutuante entre vários itens (regra 20/21 aplicada também no
// lado do cliente, só que aqui é só pra exibição, não pra gravar nada).

export type ClientUnitsLine = {
  type: "units";
  key: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  unitPriceCents: number;
  openQuantity: number;
  totalQuantity: number;
  orderItemIds: string[];
};

export type ClientSingleLine = {
  type: "single";
  key: string;
  itemId: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  openAmountCents: number;
  lineTotalCents: number;
  share: { openParts: number; nominalPartCents: number } | null;
};

export type ClientPayableLine = ClientUnitsLine | ClientSingleLine;

function toCents(value: { toNumber: () => number; mul: (n: number) => { round: () => { toNumber: () => number } } }): number {
  return value.mul(100).round().toNumber();
}

export function toClientPayableLines(lines: PayableLine[]): ClientPayableLine[] {
  return lines.map((line) => {
    if (line.type === "units") {
      return {
        type: "units",
        key: line.key,
        label: line.label,
        guestId: line.guestId,
        guestName: line.guestName,
        unitPriceCents: toCents(line.unitPrice),
        openQuantity: line.openQuantity,
        totalQuantity: line.totalQuantity,
        orderItemIds: line.sourceItems.map((s) => s.itemId),
      };
    }
    return {
      type: "single",
      key: line.key,
      itemId: line.itemId,
      label: line.label,
      guestId: line.guestId,
      guestName: line.guestName,
      openAmountCents: toCents(line.openAmount),
      lineTotalCents: toCents(line.lineTotal),
      share: line.share
        ? { openParts: line.share.openParts, nominalPartCents: toCents(line.share.nominalPartValue) }
        : null,
    };
  });
}
