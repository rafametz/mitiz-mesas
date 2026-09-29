import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEnoughAvailability, isPositiveQuantity } from "@/domain/roast/production";
import { isRoastReservationEditable } from "@/domain/roast/states";
import { recalculateReservedQuantity } from "./recalculate-reserved";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { publishChange } from "@/lib/realtime/publish";
import {
  restaurantRoastReservationsChannel,
  roastProductionDayChannel,
} from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class EditRoastReservationError extends Error {}

const itemSchema = z.object({
  roastProductId: z.string().min(1),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero").max(100000),
});

const editReservationSchema = z.object({
  reservationId: z.string().min(1),
  editedById: z.string().min(1),
  customerName: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  customerPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  items: z
    .array(itemSchema)
    .min(1, "Adicione ao menos um item à reserva")
    .transform((items) => {
      const merged = new Map<string, number>();
      for (const item of items) {
        merged.set(item.roastProductId, (merged.get(item.roastProductId) ?? 0) + item.quantity);
      }
      return [...merged.entries()].map(([roastProductId, quantity]) => ({
        roastProductId,
        quantity,
      }));
    }),
});

export type EditRoastReservationInput = z.input<typeof editReservationSchema>;

async function runTransaction(data: z.infer<typeof editReservationSchema>) {
  return prisma.$transaction(
    async (tx) => {
      const reservation = await tx.roastReservation.findUniqueOrThrow({
        where: { id: data.reservationId },
        include: { items: true },
      });

      if (!isRoastReservationEditable(reservation.status)) {
        throw new EditRoastReservationError(
          "Esta reserva não pode mais ser editada (só reserva pendente pode).",
        );
      }

      // Produções afetadas pelos itens ANTIGOS (para recalcular depois de
      // remover) e pelos NOVOS (para validar disponibilidade e recalcular).
      const oldProductionIds = new Set(reservation.items.map((item) => item.roastProductionId));

      const roastProductIds = data.items.map((item) => item.roastProductId);
      const productions = await tx.roastProduction.findMany({
        where: { productionDayId: reservation.productionDayId, roastProductId: { in: roastProductIds } },
        include: { roastProduct: true },
      });
      const productionsByProductId = new Map(productions.map((p) => [p.roastProductId, p]));

      // Disponibilidade desconsiderando o que esta MESMA reserva já tinha
      // reservado antes da edição (senão ela "colidiria" consigo mesma).
      const previouslyReservedByProduction = new Map<string, Prisma.Decimal>();
      for (const item of reservation.items) {
        const current = previouslyReservedByProduction.get(item.roastProductionId) ?? new Prisma.Decimal(0);
        previouslyReservedByProduction.set(item.roastProductionId, current.add(item.quantity));
      }

      for (const item of data.items) {
        if (!isPositiveQuantity(item.quantity)) {
          throw new EditRoastReservationError("Quantidade deve ser maior que zero.");
        }

        const production = productionsByProductId.get(item.roastProductId);
        if (!production) {
          throw new EditRoastReservationError(
            "Um dos produtos selecionados não está disponível para este dia.",
          );
        }
        if (!production.roastProduct.active) {
          throw new EditRoastReservationError(
            `"${production.roastProduct.name}" não está mais disponível.`,
          );
        }

        const alreadyHeld =
          previouslyReservedByProduction.get(production.id) ?? new Prisma.Decimal(0);
        const reservedByOthers = production.reservedQuantity.sub(alreadyHeld);

        if (!hasEnoughAvailability(production.plannedQuantity, reservedByOthers, item.quantity)) {
          const available = production.plannedQuantity.sub(reservedByOthers);
          throw new EditRoastReservationError(
            `Disponível de "${production.roastProduct.name}" é ${available} ${production.roastProduct.unit}, ` +
              `menor que o pedido (${item.quantity}).`,
          );
        }
      }

      await tx.roastReservationItem.deleteMany({ where: { reservationId: reservation.id } });

      await tx.roastReservation.update({
        where: { id: reservation.id },
        data: {
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          notes: data.notes,
          items: {
            create: data.items.map((item) => {
              const production = productionsByProductId.get(item.roastProductId)!;
              return {
                roastProductionId: production.id,
                productNameAtReservation: production.roastProduct.name,
                unitAtReservation: production.roastProduct.unit,
                quantity: item.quantity,
              };
            }),
          },
        },
      });

      const affectedProductionIds = new Set([
        ...oldProductionIds,
        ...[...productionsByProductId.values()].map((p) => p.id),
      ]);
      for (const productionId of affectedProductionIds) {
        await recalculateReservedQuantity(tx, productionId);
      }

      await writeAuditLog(tx, {
        restaurantId: reservation.restaurantId,
        userId: data.editedById,
        tableId: null,
        action: "roast_reservation.edited",
        entityType: "RoastReservation",
        entityId: reservation.id,
        metadata: { items: data.items },
      });

      return reservation;
    },
    {
      // Serializable + retry: mesmo racional de create-reservation.ts —
      // editar concorre pela mesma disponibilidade que uma criação nova.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2034" || error.code === "P2028";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /could not serialize|deadlock detected/i.test(error.message);
  }
  return false;
}

export async function editRoastReservation(input: EditRoastReservationInput) {
  const data = editReservationSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const reservation = await runTransaction(data);

      const channels = [
        roastProductionDayChannel(reservation.productionDayId),
        restaurantRoastReservationsChannel(reservation.restaurantId),
      ];
      await runAfterResponse(() => publishChange(channels, "roast_reservation.edited"));

      return reservation;
    } catch (error) {
      if (error instanceof EditRoastReservationError) throw error;
      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível editar a reserva.");
}
