import { Prisma } from "@prisma/client";

// CLAUDE.md regra 20/21: nunca usar ponto flutuante para dinheiro. Toda
// soma/multiplicação de valores monetários passa pelo Decimal do Prisma
// (decimal.js por baixo), nunca por `Number(...)`.
export const ZERO = new Prisma.Decimal(0);

export function toDecimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function sumDecimals(values: Prisma.Decimal.Value[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((total, value) => total.add(value), ZERO);
}

export function formatBRL(value: Prisma.Decimal.Value): string {
  return Number(value.toString()).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
