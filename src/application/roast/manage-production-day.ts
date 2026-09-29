import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidDateKey } from "@/domain/roast/production";
import { toDecimal } from "@/lib/money";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantRoastReservationsChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class ManageProductionDayError extends Error {}

const quantitySchema = z.object({
  roastProductId: z.string().min(1),
  // Aceita vazio/0 = produto não disponível neste dia (não remove o
  // RoastProduct do catálogo, só zera a produção deste dia específico).
  // Sempre inteiro (pedido do usuário 2026-10-04, mesmo racional de
  // create-reservation.ts) — validado aqui, nunca só na UI (regra 24).
  plannedQuantity: z.coerce
    .number()
    .int("Quantidade deve ser um número inteiro")
    .min(0)
    .max(100000),
});

const manageProductionDaySchema = z.object({
  restaurantId: z.string().min(1),
  date: z.string().refine(isValidDateKey, "Data inválida"),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  quantities: z.array(quantitySchema).max(50),
});

export type ManageProductionDayInput = z.input<typeof manageProductionDaySchema>;

// Cadastro/edição de um dia de produção pelo Administrador (proposta
// seção 3 — "Produção por data"). Upsert simples, sem concorrência
// especial: só o Administrador mexe aqui (área /admin, já protegida por
// ADMIN_MANAGE), diferente de create-reservation.ts, que precisa da trava
// serializável porque qualquer garçom pode disparar ao mesmo tempo.
export async function manageProductionDay(input: ManageProductionDayInput) {
  const data = manageProductionDaySchema.parse(input);

  const result = await prisma.$transaction(async (tx) => {
    const productionDay = await tx.roastProductionDay.upsert({
      where: { restaurantId_date: { restaurantId: data.restaurantId, date: data.date } },
      update: { notes: data.notes },
      create: { restaurantId: data.restaurantId, date: data.date, notes: data.notes },
    });

    for (const entry of data.quantities) {
      const existing = await tx.roastProduction.findUnique({
        where: {
          productionDayId_roastProductId: {
            productionDayId: productionDay.id,
            roastProductId: entry.roastProductId,
          },
        },
      });

      // Não deixa reduzir o planejado abaixo do que já está reservado —
      // criaria disponibilidade negativa silenciosa (overbooking retroativo).
      // Quem precisa reduzir de verdade cancela reserva primeiro.
      if (existing && toDecimal(entry.plannedQuantity).lessThan(existing.reservedQuantity)) {
        const product = await tx.roastProduct.findUniqueOrThrow({
          where: { id: entry.roastProductId },
        });
        throw new ManageProductionDayError(
          `"${product.name}" já tem ${existing.reservedQuantity} ${product.unit} reservados neste dia. ` +
            `Não é possível planejar menos que isso sem cancelar reserva antes.`,
        );
      }

      await tx.roastProduction.upsert({
        where: {
          productionDayId_roastProductId: {
            productionDayId: productionDay.id,
            roastProductId: entry.roastProductId,
          },
        },
        update: { plannedQuantity: entry.plannedQuantity },
        create: {
          productionDayId: productionDay.id,
          roastProductId: entry.roastProductId,
          plannedQuantity: entry.plannedQuantity,
        },
      });
    }

    return productionDay;
  });

  await runAfterResponse(() =>
    publishChange(
      [restaurantRoastReservationsChannel(data.restaurantId)],
      "roast_production_day.updated",
    ),
  );

  return result;
}
