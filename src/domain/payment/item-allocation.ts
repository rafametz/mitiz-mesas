import { AllocationKind, type MeatPoint } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { MEAT_POINT_LABELS } from "@/domain/order/labels";

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006). Puro,
// sem I/O — quem chama já buscou os itens e alocações do banco. Mesmo
// racional de src/domain/service-session/split.ts: calculadora, quem
// grava de verdade é a camada de aplicação (register-payment.ts), sempre
// revalidando contra o banco dentro da transação.
//
// Regra fundamental (CLAUDE.md, pedido do usuário 2026-08-15): um item não
// é só "pago ou não pago". Aqui ele é sempre um valor em aberto (Decimal),
// e para itens lançados com quantidade > 1 também uma contagem de unidades
// em aberto.

export type AllocationInput = {
  kind: AllocationKind;
  // Só kind = UNITS.
  quantity: number | null;
  amount: Prisma.Decimal.Value;
  // true quando o Payment dono desta alocação está estornado — alocação
  // de pagamento estornado nunca conta como "pago" (mesmo filtro que
  // recalculateSessionTotals já aplica em Payment.voidedAt).
  voided: boolean;
};

export type PayableOrderItemInput = {
  id: string;
  productId: string;
  productNameAtOrder: string;
  meatPoint: MeatPoint | null;
  guestId: string | null;
  guestName: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  modifiers: {
    modifierNameAtOrder: string;
    priceDeltaAtOrder: Prisma.Decimal.Value;
    quantity: number;
  }[];
  // Em quantas partes o saldo aberto está dividido agora ("Dividir item").
  // Só relevante para item lançado com quantity = 1 (v1 — CLAUDE.md
  // backlog: dividir entre várias porções iguais fica para uma v2).
  openShareParts: number | null;
  createdAt: Date;
  allocations: AllocationInput[];
};

// unitPrice + adicionais já embutidos, multiplicado pela quantidade da
// linha — mesma fórmula usada em recalculateSessionTotals e
// buildConsolidatedSummary (duplicada nesses dois lugares também; não é
// um util novo pra não espalhar mais um ponto de import cruzado entre
// domínio e aplicação à toa).
export function computeItemLineTotal(
  item: Pick<PayableOrderItemInput, "unitPrice" | "quantity" | "modifiers">,
): Prisma.Decimal {
  const modifiersTotal = sumDecimals(
    item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
  );
  return toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);
}

function activeAllocations(allocations: AllocationInput[]): AllocationInput[] {
  return allocations.filter((a) => !a.voided);
}

// Valor já coberto por pagamento não estornado, contra este item.
export function paidAmountForItem(item: PayableOrderItemInput): Prisma.Decimal {
  return sumDecimals(activeAllocations(item.allocations).map((a) => a.amount));
}

// Saldo do item ainda sem cobertura de pagamento — nunca negativo (defesa
// contra arredondamento; a validação de verdade que impede passar do
// aberto acontece na hora de gravar a alocação, não aqui).
export function openAmountForItem(item: PayableOrderItemInput): Prisma.Decimal {
  const open = computeItemLineTotal(item).sub(paidAmountForItem(item));
  return open.lessThan(ZERO) ? ZERO : open;
}

// Unidades já cobertas por alocações kind=UNITS não estornadas.
export function paidUnitsForItem(item: PayableOrderItemInput): number {
  return activeAllocations(item.allocations)
    .filter((a) => a.kind === "UNITS")
    .reduce((total, a) => total + (a.quantity ?? 0), 0);
}

export function openUnitsForItem(item: PayableOrderItemInput): number {
  const open = item.quantity - paidUnitsForItem(item);
  return open < 0 ? 0 : open;
}

// --- Linhas para a tela de seleção de consumo ------------------------------
//
// Regra de agrupamento (revisada 2026-08-15 — correção de bug: itens
// lançados quantity=1 em pedidos diferentes, ex. um chope de cada vez,
// não agrupavam antes desta revisão): linhas do mesmo produto + ponto +
// adicionais + pessoa sempre se juntam, não importa a quantidade de cada
// linha de origem nem se vieram de pedidos diferentes (ex.: 2 chopes
// lançados agora + 2 chopes lançados uma hora depois viram "4 chopes"
// numa seleção só, pagos por unidade, mais antiga primeiro). O grupo só
// vira uma linha "unidades" (com stepper) quando a soma é maior que 1;
// exatamente 1 unidade sozinha continua sendo o item único de sempre
// (pagar inteiro/dividir/valor personalizado). Item já dividido
// ("Dividir item") nunca entra num grupo, mesmo que exista outro igual
// ainda fechado — carrega uma fração própria. Duas porções iguais, NENHUMA
// ainda dividida, agora também se agrupam numa linha "2 lançados": dá pra
// pagar uma inteira de cada vez; a última que sobrar sozinha volta a
// oferecer "Dividir item" normalmente. Dividir uma entre as duas enquanto
// as duas ainda estão abertas continua fora do escopo da v1 (backlog).

export type UnitsPayableLine = {
  type: "units";
  key: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  unitPrice: Prisma.Decimal;
  totalQuantity: number;
  openQuantity: number;
  openAmount: Prisma.Decimal;
  // Linhas de origem (OrderItem reais), mais antiga primeiro — quem aloca
  // consome delas em ordem (FIFO), ver distributeUnitsFifo.
  sourceItems: { itemId: string; openQuantity: number; unitPrice: Prisma.Decimal }[];
};

export type SharePayableLine = {
  type: "single";
  key: string;
  itemId: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  lineTotal: Prisma.Decimal;
  openAmount: Prisma.Decimal;
  // Presente quando o item está no modo "dividido"; nulo = item normal
  // (pagar inteiro ou valor personalizado, sem fração).
  share: { openParts: number; nominalPartValue: Prisma.Decimal } | null;
};

export type PayableLine = UnitsPayableLine | SharePayableLine;

function itemLabel(item: PayableOrderItemInput): string {
  const meatPointLabel =
    item.meatPoint && item.meatPoint !== "NAO_SE_APLICA" ? ` (${MEAT_POINT_LABELS[item.meatPoint]})` : "";
  const modifierLabel =
    item.modifiers.length > 0 ? ` + ${item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}` : "";
  return `${item.productNameAtOrder}${meatPointLabel}${modifierLabel}`;
}

function toSingleLine(item: PayableOrderItemInput): SharePayableLine | null {
  const openAmount = openAmountForItem(item);
  if (openAmount.lessThanOrEqualTo(ZERO)) return null;

  const lineTotal = computeItemLineTotal(item);
  const share =
    item.openShareParts && item.openShareParts > 0
      ? { openParts: item.openShareParts, nominalPartValue: openAmount.div(item.openShareParts) }
      : null;

  return {
    type: "single",
    key: item.id,
    itemId: item.id,
    label: itemLabel(item),
    guestId: item.guestId,
    guestName: item.guestName,
    lineTotal,
    openAmount,
    share,
  };
}

export function buildPayableLines(items: PayableOrderItemInput[]): PayableLine[] {
  const unitsGroups = new Map<
    string,
    { label: string; guestId: string | null; guestName: string | null; items: PayableOrderItemInput[] }
  >();
  const singleLines: SharePayableLine[] = [];

  for (const item of items) {
    // Item já dividido ("Dividir item") nunca agrupa com outro igual —
    // ele carrega uma fração própria, diferente de um irmão idêntico
    // ainda não tocado (2026-08-15, correção de bug: agrupamento não
    // funcionava para item lançado quantity=1 em pedidos diferentes,
    // mesmo sem estar dividido).
    if (item.quantity === 1 && item.openShareParts) {
      const single = toSingleLine(item);
      if (single) singleLines.push(single);
      continue;
    }

    // Agrupa por produto + ponto + adicionais + pessoa, juntando linhas
    // de origem diferentes (mesmo produto lançado em pedidos diferentes,
    // ou várias vezes no mesmo pedido) independente da quantidade de
    // cada linha — é a soma entre as linhas que decide se vira um
    // seletor de unidades (grupo com mais de 1 unidade no total) ou uma
    // linha única (exatamente 1 unidade, nenhuma outra linha igual).
    const modifierKey = item.modifiers
      .map((m) => m.modifierNameAtOrder)
      .sort()
      .join(",");
    const key = `${item.productId}|${item.meatPoint ?? ""}|${modifierKey}|${item.guestId ?? ""}`;
    const existing = unitsGroups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      unitsGroups.set(key, {
        label: itemLabel(item),
        guestId: item.guestId,
        guestName: item.guestName,
        items: [item],
      });
    }
  }

  // Grupo com uma única linha de quantidade 1 não é "unidades", é o
  // item único de sempre (pagar inteiro / dividir / valor personalizado).
  for (const [key, group] of unitsGroups) {
    if (group.items.length === 1 && group.items[0]!.quantity === 1) {
      unitsGroups.delete(key);
      const single = toSingleLine(group.items[0]!);
      if (single) singleLines.push(single);
    }
  }

  const unitsLines: UnitsPayableLine[] = [...unitsGroups.entries()]
    .map(([key, group]) => {
      const sourceItems = group.items
        .slice()
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((item) => ({
          itemId: item.id,
          openQuantity: openUnitsForItem(item),
          unitPrice: computeItemLineTotal(item).div(item.quantity),
        }))
        .filter((source) => source.openQuantity > 0);

      const totalQuantity = sumField(group.items, (item) => item.quantity);
      const openQuantity = sumField(sourceItems, (s) => s.openQuantity);
      const openAmount = sumDecimals(sourceItems.map((s) => s.unitPrice.mul(s.openQuantity)));
      // Preço unitário de referência pra exibição: da linha mais antiga
      // ainda aberta (todas deveriam ter o mesmo preço na prática, já que
      // o agrupamento já exige mesmo produto + adicionais; preço muda
      // entre pedidos só se o cadastro do produto mudou no meio do
      // atendimento, regra 9/10 já congela por linha).
      const unitPrice = sourceItems[0]?.unitPrice ?? ZERO;

      return {
        type: "units" as const,
        key,
        label: group.label,
        guestId: group.guestId,
        guestName: group.guestName,
        unitPrice,
        totalQuantity,
        openQuantity,
        openAmount,
        sourceItems,
      };
    })
    .filter((line) => line.openQuantity > 0);

  return [...unitsLines, ...singleLines].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function sumField<T>(items: T[], get: (item: T) => number): number {
  return items.reduce((total, item) => total + get(item), 0);
}

// --- Situação de pagamento por item (exibição, sempre) ---------------------
//
// Diferente de buildPayableLines (só o que ainda pode ser selecionado
// para pagar, agrupado), esta lista mostra TODO item não cancelado,
// inclusive o que já está 100% pago — usada na tela de pagamentos pra dar
// visão geral do que já foi quitado e o que falta (pedido do usuário
// 2026-08-15: "quando a segunda pessoa chegar pra pagar, o operador
// consegue entender imediatamente o que já foi quitado"). Uma linha por
// OrderItem real, sem agrupar entre pedidos diferentes (diferente da
// seleção de pagamento) — mais simples e direto pra uma lista só de
// consulta.

export type ItemPaymentStatus = {
  itemId: string;
  label: string;
  guestName: string | null;
  lineTotal: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  openAmount: Prisma.Decimal;
  // Só presente quando o item foi lançado com quantity > 1.
  units: { total: number; paid: number; open: number } | null;
  // Só presente quando o item está no modo dividido ("Dividir item").
  openShareParts: number | null;
};

export function buildItemPaymentStatuses(items: PayableOrderItemInput[]): ItemPaymentStatus[] {
  return items
    .map((item) => ({
      itemId: item.id,
      label: itemLabel(item),
      guestName: item.guestName,
      lineTotal: computeItemLineTotal(item),
      paidAmount: paidAmountForItem(item),
      openAmount: openAmountForItem(item),
      units:
        item.quantity > 1
          ? { total: item.quantity, paid: paidUnitsForItem(item), open: openUnitsForItem(item) }
          : null,
      openShareParts: item.openShareParts,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

// --- Distribuição FIFO de unidades entre linhas de origem -------------------
//
// Quando o operador pede "3 unidades" de um grupo que existe em mais de um
// OrderItem real (ex.: 4 chopes de um pedido + 6 de outro), decide de qual
// linha real tirar cada unidade: sempre a mais antiga primeiro, até
// esgotar a quantidade pedida. Puro — a aplicação chama isso já com o
// estado (aberto por linha) buscado fresco do banco dentro da transação,
// nunca com o que a tela do operador tinha carregado.

export class InsufficientQuantityError extends Error {}

export function distributeUnitsFifo(
  requestedQuantity: number,
  sourceItems: { itemId: string; openQuantity: number; unitPrice: Prisma.Decimal }[],
): { orderItemId: string; quantity: number; amount: Prisma.Decimal }[] {
  if (requestedQuantity <= 0) {
    throw new InsufficientQuantityError("Quantidade deve ser maior que zero.");
  }

  const available = sourceItems.reduce((total, s) => total + s.openQuantity, 0);
  if (requestedQuantity > available) {
    throw new InsufficientQuantityError(
      `Só há ${available} unidade(s) em aberto, foi pedido ${requestedQuantity}.`,
    );
  }

  let remaining = requestedQuantity;
  const result: { orderItemId: string; quantity: number; amount: Prisma.Decimal }[] = [];
  for (const source of sourceItems) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, source.openQuantity);
    if (take <= 0) continue;
    result.push({ orderItemId: source.itemId, quantity: take, amount: source.unitPrice.mul(take) });
    remaining -= take;
  }
  return result;
}
