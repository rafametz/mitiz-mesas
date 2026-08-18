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
  // Em quantas partes o saldo aberto do GRUPO (este item + qualquer outro
  // igual, mesmo de pedido diferente) está dividido agora ("Dividir" —
  // revisado 2026-08-16: disponível pra qualquer item, não só o que tem
  // quantidade 1). Uma ação de "Dividir"/"Redistribuir" grava o mesmo
  // valor em todas as linhas do grupo no momento em que é acionada.
  openShareParts: number | null;
  // Valor total que estava aberto no GRUPO no momento em que a divisão foi
  // feita/redistribuída (revisado 2026-08-18: base FIXA do rateio). O
  // nominal de uma parte é sempre este valor / openShareParts, nunca o
  // saldo aberto atual / openShareParts — senão cada parte paga encolhe o
  // valor da próxima (bug relatado pelo usuário). Só null em item nunca
  // dividido, ou dividido antes desta revisão (tratado como igual ao
  // saldo aberto atual, mesmo comportamento de antes, até o próximo
  // "Redistribuir" gravar a base).
  openShareBaseAmount: Prisma.Decimal.Value | null;
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
// Regra de agrupamento (revisada 2026-08-16 — pedido do usuário: mesmo um
// item com mais de uma unidade, ou repetido em pedidos diferentes, precisa
// oferecer as duas formas de pagamento ao mesmo tempo): linhas do mesmo
// produto + ponto + adicionais + pessoa sempre se juntam num grupo só, não
// importa a quantidade de cada linha de origem nem se vieram de pedidos
// diferentes (ex.: 2 porções de linguiça lançadas em pedidos diferentes
// viram um grupo só de "2 lançadas"). O grupo com exatamente 1 unidade e
// nenhum outro igual continua sendo o item único de sempre (pagar
// inteiro/dividir/valor personalizado, tipo "single"). Qualquer outro
// grupo (mais de uma linha de origem, ou uma linha só com quantidade > 1)
// vira uma linha "unidades" (tipo "units"), que agora TAMBÉM pode estar
// dividida: junto do seletor de unidades, sempre disponível "Dividir"/
// "Redistribuir", que reparte o saldo aberto do GRUPO INTEIRO (soma de
// todas as linhas de origem) em N partes — ex.: 2 porções de R$29 cada
// (R$58 no total) divididas em 4 partes de R$14,50. Uma "Dividir"/
// "Redistribuir" grava o mesmo `openShareParts` em todas as linhas do
// grupo no momento em que é acionada; pagamentos já feitos guardam seu
// próprio snapshot em PaymentItemAllocation, nunca são recalculados
// depois (mesma regra de sempre). Uma fração pedida (ex.: "1 parte") pode
// consumir mais de uma linha de origem se o valor da parte passar do
// saldo da linha mais antiga — ver distributeAmountFifo.

export type PayableLineShare = { openParts: number; nominalPartValue: Prisma.Decimal };

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
  // consome delas em ordem (FIFO), ver distributeUnitsFifo/distributeAmountFifo.
  sourceItems: { itemId: string; openQuantity: number; unitPrice: Prisma.Decimal }[];
  // Presente quando o grupo está no modo "dividido"; nulo = ainda não foi
  // dividido (só o seletor de unidades disponível, "Dividir" continua
  // oferecido pra ativar).
  share: PayableLineShare | null;
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
  share: PayableLineShare | null;
};

export type PayableLine = UnitsPayableLine | SharePayableLine;

function itemLabel(item: PayableOrderItemInput): string {
  const meatPointLabel =
    item.meatPoint && item.meatPoint !== "NAO_SE_APLICA" ? ` (${MEAT_POINT_LABELS[item.meatPoint]})` : "";
  const modifierLabel =
    item.modifiers.length > 0 ? ` + ${item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}` : "";
  return `${item.productNameAtOrder}${meatPointLabel}${modifierLabel}`;
}

type ItemGroup = { label: string; guestId: string | null; guestName: string | null; items: PayableOrderItemInput[] };

// Agrupamento compartilhado (2026-08-15/16): mesmo critério usado tanto na
// seleção de pagamento (buildPayableLines) quanto no painel de situação
// (buildItemPaymentStatuses) — as duas telas precisam concordar sobre o
// que é "o mesmo item", senão uma mostra agrupado e a outra não (bug
// relatado pelo usuário: painel de situação mostrava "Chopp Pilsen" duas
// vezes, uma por pedido, mesmo depois do agrupamento já ter sido
// corrigido na seleção de pagamento). Revisado 2026-08-16: item dividido
// não fica mais isolado do grupo — dividir passou a ser uma propriedade
// do GRUPO inteiro (ver comentário de PayableLine acima), então uma linha
// dividida continua agrupada com as demais linhas iguais.
function groupItemsByLine(items: PayableOrderItemInput[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();

  for (const item of items) {
    const key = `${item.productId}|${item.meatPoint ?? ""}|${item.modifiers
      .map((m) => m.modifierNameAtOrder)
      .sort()
      .join(",")}|${item.guestId ?? ""}`;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        label: itemLabel(item),
        guestId: item.guestId,
        guestName: item.guestName,
        items: [item],
      });
    }
  }

  return [...groups.values()];
}

// Rateio vigente do grupo — parte e base fixa da linha mais antiga que
// tiver openShareParts gravado (todas deveriam concordar, já que toda
// ação de "Dividir"/"Redistribuir" estampa os dois campos juntos nas
// linhas do grupo no momento em que é acionada; se uma linha nova chegou
// depois de um "Dividir" anterior sem redistribuir de novo, a mais antiga
// prevalece até o próximo "Redistribuir"). O nominal da parte usa sempre
// a base fixa (openShareBaseAmount), nunca o saldo aberto atual — senão
// cada parte paga encolhe o valor da próxima (revisão 2026-08-18). Item
// dividido antes desta revisão (sem base gravada ainda) cai no saldo
// aberto atual como base, mesmo comportamento de antes, até o próximo
// "Redistribuir" gravar a base de verdade.
function groupShareInfo(
  items: PayableOrderItemInput[],
  currentOpenAmount: Prisma.Decimal,
): PayableLineShare | null {
  const sorted = items.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const withParts = sorted.find((i) => i.openShareParts && i.openShareParts > 0);
  if (!withParts) return null;
  const openParts = withParts.openShareParts!;
  const baseAmount =
    withParts.openShareBaseAmount !== null ? toDecimal(withParts.openShareBaseAmount) : currentOpenAmount;
  return { openParts, nominalPartValue: baseAmount.div(openParts) };
}

function toSingleLine(item: PayableOrderItemInput): SharePayableLine | null {
  const openAmount = openAmountForItem(item);
  if (openAmount.lessThanOrEqualTo(ZERO)) return null;

  const lineTotal = computeItemLineTotal(item);
  const share = groupShareInfo([item], openAmount);

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
  const singleLines: SharePayableLine[] = [];
  const unitsGroupEntries: [string, ItemGroup][] = [];

  for (const group of groupItemsByLine(items)) {
    // Grupo com uma única linha de quantidade 1 não é "unidades", é o
    // item único de sempre (pagar inteiro / dividir / valor personalizado).
    if (group.items.length === 1 && group.items[0]!.quantity === 1) {
      const single = toSingleLine(group.items[0]!);
      if (single) singleLines.push(single);
      continue;
    }
    unitsGroupEntries.push([group.items.map((i) => i.id).join("+"), group]);
  }

  const unitsLines: UnitsPayableLine[] = unitsGroupEntries
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
      // Saldo aberto do grupo inteiro (soma de todas as linhas de
      // origem) — não só das que ainda têm unidade sobrando, porque uma
      // linha pode estar "fechada" pra unidades (openQuantity=0 depois de
      // pagamentos parciais em R$, não em unidades) mas ainda ter saldo
      // em R$ pra "Dividir" alocar.
      const openAmount = sumDecimals(group.items.map((item) => openAmountForItem(item)));
      // Preço unitário de referência pra exibição: da linha mais antiga
      // ainda aberta (todas deveriam ter o mesmo preço na prática, já que
      // o agrupamento já exige mesmo produto + adicionais; preço muda
      // entre pedidos só se o cadastro do produto mudou no meio do
      // atendimento, regra 9/10 já congela por linha).
      const unitPrice = sourceItems[0]?.unitPrice ?? computeItemLineTotal(group.items[0]!).div(group.items[0]!.quantity);

      const share = groupShareInfo(group.items, openAmount);

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
        share,
      };
    })
    .filter((line) => line.openAmount.greaterThan(ZERO));

  return [...unitsLines, ...singleLines].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function sumField<T>(items: T[], get: (item: T) => number): number {
  return items.reduce((total, item) => total + get(item), 0);
}

// --- Situação de pagamento por item (exibição, sempre) ---------------------
//
// Diferente de buildPayableLines (só o que ainda pode ser selecionado
// para pagar), esta lista mostra TODO item não cancelado, inclusive o que
// já está 100% pago — usada na tela de pagamentos pra dar visão geral do
// que já foi quitado e o que falta (pedido do usuário 2026-08-15: "quando
// a segunda pessoa chegar pra pagar, o operador consegue entender
// imediatamente o que já foi quitado"). Mesmo agrupamento de
// buildPayableLines (correção de bug 2026-08-15: este painel mostrava o
// mesmo produto duas vezes quando lançado em pedidos diferentes, mesmo já
// agrupando corretamente na tela de seleção) — o caixa decide quantas
// unidades pagar independente de qual pedido cada uma veio.

export type ItemPaymentStatus = {
  // Um por linha de origem no grupo — usado pra decidir tom/estado, não
  // precisa ser único por produto (vários grupos podem aparecer).
  itemId: string;
  label: string;
  guestName: string | null;
  lineTotal: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  openAmount: Prisma.Decimal;
  // Só presente quando o grupo soma mais de 1 unidade (uma ou mais linhas
  // de origem, lançadas juntas ou em pedidos diferentes).
  units: { total: number; paid: number; open: number } | null;
  // Em quantas partes o saldo aberto do grupo está dividido agora
  // (revisado 2026-08-16: qualquer grupo pode estar dividido, não só o
  // de uma linha só).
  openShareParts: number | null;
};

export function buildItemPaymentStatuses(items: PayableOrderItemInput[]): ItemPaymentStatus[] {
  return groupItemsByLine(items)
    .map((group) => {
      const totalQuantity = sumField(group.items, (item) => item.quantity);
      const paidUnits = sumField(group.items, (item) => paidUnitsForItem(item));
      const openAmount = sumDecimals(group.items.map((item) => openAmountForItem(item)));
      return {
        itemId: group.items[0]!.id,
        label: group.label,
        guestName: group.guestName,
        lineTotal: sumDecimals(group.items.map((item) => computeItemLineTotal(item))),
        paidAmount: sumDecimals(group.items.map((item) => paidAmountForItem(item))),
        openAmount,
        units:
          totalQuantity > 1
            ? { total: totalQuantity, paid: paidUnits, open: totalQuantity - paidUnits }
            : null,
        openShareParts: groupShareInfo(group.items, openAmount)?.openParts ?? null,
      };
    })
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

// --- Distribuição FIFO de um VALOR entre linhas de origem -------------------
//
// Mesmo racional de distributeUnitsFifo, mas pra "Dividir"/valor
// personalizado (2026-08-16): o alvo é um valor em R$, não uma
// quantidade de unidades — uma "parte" pode passar do saldo da linha
// mais antiga e precisar tirar um pouco da próxima também (ex.: 2
// porções de R$29 cada, dividir em 4 = R$14,50 a parte — cabe inteira na
// primeira linha; já "3 partes" = R$43,50 tira os R$29 inteiros da
// primeira linha mais R$14,50 da segunda).

export class InsufficientAmountError extends Error {}

export function distributeAmountFifo(
  targetAmount: Prisma.Decimal,
  sourceItems: { itemId: string; openAmount: Prisma.Decimal }[],
): { orderItemId: string; amount: Prisma.Decimal }[] {
  if (targetAmount.lessThanOrEqualTo(ZERO)) {
    throw new InsufficientAmountError("Valor deve ser maior que zero.");
  }

  const available = sumDecimals(sourceItems.map((s) => s.openAmount));
  if (targetAmount.greaterThan(available)) {
    throw new InsufficientAmountError(
      `Só há ${available.toFixed(2)} em aberto, foi pedido ${targetAmount.toFixed(2)}.`,
    );
  }

  let remaining = targetAmount;
  const result: { orderItemId: string; amount: Prisma.Decimal }[] = [];
  for (const source of sourceItems) {
    if (remaining.lessThanOrEqualTo(ZERO)) break;
    const take = remaining.lessThan(source.openAmount) ? remaining : source.openAmount;
    if (take.lessThanOrEqualTo(ZERO)) continue;
    result.push({ orderItemId: source.itemId, amount: take });
    remaining = remaining.sub(take);
  }
  return result;
}
