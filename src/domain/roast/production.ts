import { Prisma } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";

// "AAAA-MM-DD" — mesmo formato de dia civil usado no restante do app (ver
// src/lib/datetime.ts, todaySaoPaulo). Puro, sem I/O: testável sem banco.
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  return DATE_KEY_REGEX.test(value);
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
