import { Prisma } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";

// "AAAA-MM-DD" — mesmo formato de dia civil usado no restante do app (ver
// src/lib/datetime.ts, todaySaoPaulo). Puro, sem I/O: testável sem banco.
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  return DATE_KEY_REGEX.test(value);
}

// A MITIZ só faz reserva de assado aos domingos (pedido do usuário
// 2026-10-04) — dado o dia informado, devolve ele mesmo se já for domingo,
// senão o próximo domingo depois dele. Usado tanto pra escolher o padrão
// ao abrir a tela (a partir de hoje) quanto pra normalizar qualquer data
// que chegue por URL (link antigo, digitação manual). `T12:00:00Z` evita
// problema de fuso na borda da meia-noite (mesmo racional de
// shiftDateKey, na tela).
export function nextSundayFrom(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const dayOfWeek = date.getUTCDay(); // 0 = domingo
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilSunday);
  return date.toISOString().slice(0, 10);
}

// Disponibilidade de um produto assado em um dia de produção — sempre
// planejado menos reservado, nunca um valor solto (painel de
// disponibilidade, CLAUDE.md/proposta seção 4). Pode ficar negativo em
// teoria (nunca deveria, a validação de reserva impede — ver
// create-reservation.ts), então não é clampada aqui: um negativo é sinal
// de bug e deve aparecer, não ser escondido.
export function availableQuantity(
  planned: Prisma.Decimal.Value,
  reserved: Prisma.Decimal.Value,
): Prisma.Decimal {
  return toDecimal(planned).sub(toDecimal(reserved));
}

export function hasEnoughAvailability(
  planned: Prisma.Decimal.Value,
  reserved: Prisma.Decimal.Value,
  requested: Prisma.Decimal.Value,
): boolean {
  return availableQuantity(planned, reserved).greaterThanOrEqualTo(toDecimal(requested));
}

export function isPositiveQuantity(value: Prisma.Decimal.Value): boolean {
  return toDecimal(value).greaterThan(ZERO);
}
