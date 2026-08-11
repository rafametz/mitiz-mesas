import { GuestStatus, Prisma } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";
import { splitByPerson, type SplitItemInput } from "./split";

// Pagamento por pessoa (revisão 2026-08-10): quanto cada pessoa consumiu
// (itens dela + fração do consumo geral, mesmo cálculo de splitByPerson),
// quanto já pagou (soma de Payment.guestId=ela, não estornados) e o que
// falta — só para EXIBIÇÃO. Marcar uma pessoa como SETTLED é uma decisão
// manual do caixa (ver domínio de fechamento); esta função nunca decide
// isso sozinha, só informa.

export type GuestParticipationInput = {
  id: string;
  name: string | null;
  status: GuestStatus;
};

export type GuestPaymentInput = {
  guestId: string | null;
  amount: Prisma.Decimal.Value;
};

export type GuestParticipation = {
  guestId: string;
  guestName: string;
  status: GuestStatus;
  consumption: Prisma.Decimal;
  paid: Prisma.Decimal;
  // Pode ficar negativo (pagou a mais que consumiu) — não é clampado,
  // é só informação pro caixa interpretar.
  balance: Prisma.Decimal;
};

export function deriveGuestParticipation(
  guests: GuestParticipationInput[],
  items: SplitItemInput[],
  payments: GuestPaymentInput[],
): GuestParticipation[] {
  if (guests.length === 0) return [];

  const paidByGuest = new Map<string, Prisma.Decimal>();
  for (const payment of payments) {
    if (!payment.guestId) continue;
    const current = paidByGuest.get(payment.guestId) ?? ZERO;
    paidByGuest.set(payment.guestId, current.add(toDecimal(payment.amount)));
  }

  const guestsById = new Map(guests.map((g) => [g.id, g]));
  const namedGuests = guests.map((g, index) => ({ id: g.id, name: g.name ?? `Pessoa ${index + 1}` }));
  const parts = splitByPerson(items, namedGuests);

  return parts.map((part) => {
    const guest = guestsById.get(part.guestId)!;
    const paid = paidByGuest.get(part.guestId) ?? ZERO;
    return {
      guestId: part.guestId,
      guestName: part.guestName,
      status: guest.status,
      consumption: part.amount,
      paid,
      balance: part.amount.sub(paid),
    };
  });
}
