import { Prisma } from "@prisma/client";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";

// Divisão de conta no fechamento (business-rules.md §6, passo 5: "por
// pessoa, item, valor, igual"). Puro — sem I/O, sem Prisma além dos tipos;
// quem chama já buscou os dados.

// Divide um total em N partes iguais sem perder nem sobrar centavo — o
// resto da divisão inteira em centavos (sempre < N) vai 1 centavo por vez
// pras primeiras partes, de forma determinística (hipótese registrada:
// backlog pedia "regra determinística de arredondamento" sem especificar
// qual; essa é a mais simples e previsível — sempre a mesma pessoa/parte
// "sobra" com o centavo a mais quando a divisão se repete).
export function splitEqually(total: Prisma.Decimal.Value, parts: number): Prisma.Decimal[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error("Número de partes deve ser um inteiro maior que zero.");
  }
  const totalCents = toDecimal(total).mul(100).round().toNumber();
  const baseCents = Math.floor(totalCents / parts);
  const remainderCents = totalCents - baseCents * parts;

  return Array.from({ length: parts }, (_, index) => {
    const cents = baseCents + (index < remainderCents ? 1 : 0);
    return toDecimal(cents).div(100);
  });
}

export type SplitItemInput = {
  guestId: string | null;
  label: string;
  lineTotal: Prisma.Decimal.Value;
};

export type PersonSplitPart = {
  guestId: string;
  guestName: string;
  // Itens lançados diretamente pra essa pessoa (não inclui a fração do
  // consumo geral) — usado pra montar a "notinha" por pessoa (divisão
  // "por item"); pra divisão "por pessoa" só o total (`amount`) importa.
  items: { label: string; amount: Prisma.Decimal }[];
  generalShare: Prisma.Decimal;
  amount: Prisma.Decimal;
};

// Divide por pessoa (e serve de base pra "por item", que é o mesmo
// agrupamento com o detalhe item a item exposto): cada um paga o que
// consumiu de fato, mais uma fração igual do "consumo geral" (itens sem
// pessoa vinculada, ex.: uma entrada pra mesa toda) — decisão confirmada
// com o usuário: consumo geral sempre rateado entre todos, nunca preso a
// uma pessoa só.
export function splitByPerson(
  items: SplitItemInput[],
  guests: { id: string; name: string }[],
): PersonSplitPart[] {
  if (guests.length === 0) {
    throw new Error("Não há pessoas cadastradas nesta mesa para dividir por pessoa.");
  }

  const itemsByGuest = new Map<string, { label: string; amount: Prisma.Decimal }[]>(
    guests.map((g) => [g.id, []]),
  );
  let generalTotal = ZERO;

  for (const item of items) {
    const lineTotal = toDecimal(item.lineTotal);
    const bucket = item.guestId ? itemsByGuest.get(item.guestId) : undefined;
    if (bucket) {
      bucket.push({ label: item.label, amount: lineTotal });
    } else {
      generalTotal = generalTotal.add(lineTotal);
    }
  }

  const generalShares = splitEqually(generalTotal, guests.length);

  return guests.map((guest, index) => {
    const guestItems = itemsByGuest.get(guest.id) ?? [];
    const generalShare = generalShares[index]!;
    const amount = sumDecimals(guestItems.map((i) => i.amount)).add(generalShare);
    return { guestId: guest.id, guestName: guest.name, items: guestItems, generalShare, amount };
  });
}

// Divisão "por valor": o caixa digita quanto cada parte paga — só valida
// que a soma bate exatamente com o total (não inventa arredondamento
// aqui, o valor já veio decidido por quem está fechando a conta).
export function isValidCustomSplit(
  total: Prisma.Decimal.Value,
  amounts: Prisma.Decimal.Value[],
): boolean {
  return sumDecimals(amounts).equals(toDecimal(total));
}
