import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasEnoughAvailability, isPositiveQuantity } from "@/domain/roast/production";
import { recalculateReservedQuantity } from "./recalculate-reserved";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { publishChange } from "@/lib/realtime/publish";
import {
  restaurantRoastReservationsChannel,
  roastProductionDayChannel,
} from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class CreateRoastReservationError extends Error {}

const itemSchema = z.object({
  roastProductId: z.string().min(1),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero").max(100000),
});

const createReservationSchema = z.object({
  restaurantId: z.string().min(1),
  productionDayId: z.string().min(1),
  waiterId: z.string().min(1),
  idempotencyKey: z.string().min(1),
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
    // Duplicar o mesmo produto na mesma reserva soma as quantidades em vez
    // de criar duas linhas ou rejeitar — mais tolerante ao que o garçom
    // pode ter feito na tela (adicionar o mesmo item duas vezes).
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

export type CreateRoastReservationInput = z.input<typeof createReservationSchema>;

const reservationInclude = {
  items: true,
} satisfies Prisma.RoastReservationInclude;

async function runTransaction(data: z.infer<typeof createReservationSchema>) {
  return prisma.$transaction(
    async (tx) => {
      // Idempotência (regra 18/19): mesma chave já usada -> devolve a
      // reserva existente em vez de duplicar (duplo toque / reenvio de
      // rede).
      const existing = await tx.roastReservation.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: reservationInclude,
      });
      if (existing) return { reservation: existing, created: false as const };

      const productionDay = await tx.roastProductionDay.findUniqueOrThrow({
        where: { id: data.productionDayId },
      });
      if (productionDay.restaurantId !== data.restaurantId) {
        throw new CreateRoastReservationError("Dia de produção inválido.");
      }

      const roastProductIds = data.items.map((item) => item.roastProductId);
      const productions = await tx.roastProduction.findMany({
        where: { productionDayId: data.productionDayId, roastProductId: { in: roastProductIds } },
        include: { roastProduct: true },
      });
      const productionsByProductId = new Map(productions.map((p) => [p.roastProductId, p]));

      for (const item of data.items) {
        if (!isPositiveQuantity(item.quantity)) {
          throw new CreateRoastReservationError("Quantidade deve ser maior que zero.");
        }

        const production = productionsByProductId.get(item.roastProductId);
        if (!production) {
          throw new CreateRoastReservationError(
            "Um dos produtos selecionados não está disponível para este dia.",
          );
        }
        if (!production.roastProduct.active) {
          throw new CreateRoastReservationError(
            `"${production.roastProduct.name}" não está mais disponível.`,
          );
        }
        if (
          !hasEnoughAvailability(production.plannedQuantity, production.reservedQuantity, item.quantity)
        ) {
          const available = production.plannedQuantity.sub(production.reservedQuantity);
          throw new CreateRoastReservationError(
            `Disponível de "${production.roastProduct.name}" é ${available} ${production.roastProduct.unit}, ` +
              `menor que o pedido (${item.quantity}).`,
          );
        }
      }

      const reservation = await tx.roastReservation.create({
        data: {
          restaurantId: data.restaurantId,
          productionDayId: data.productionDayId,
          waiterId: data.waiterId,
          idempotencyKey: data.idempotencyKey,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          notes: data.notes,
          status: "PENDING",
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
        include: reservationInclude,
      });

      for (const production of productionsByProductId.values()) {
        await recalculateReservedQuantity(tx, production.id);
      }

      await writeAuditLog(tx, {
        restaurantId: data.restaurantId,
        userId: data.waiterId,
        tableId: null,
        action: "roast_reservation.created",
        entityType: "RoastReservation",
        entityId: reservation.id,
        metadata: {
          customerName: data.customerName,
          items: data.items,
        },
      });

      return { reservation, created: true as const };
    },
    {
      // Serializable + retry: mesmo racional de create-order.ts — mais de
      // um garçom pode reservar o mesmo produto do mesmo dia ao mesmo
      // tempo, e a checagem de disponibilidade acima só é confiável sob
      // isolamento serializável (senão duas reservas concorrentes podem
      // cada uma ler "cabe" antes da outra gravar, dando overbooking).
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

export async function createRoastReservation(input: CreateRoastReservationInput) {
  const data = createReservationSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await runTransaction(data);

      if (result.created) {
        const channels = [
          roastProductionDayChannel(data.productionDayId),
          restaurantRoastReservationsChannel(data.restaurantId),
        ];
        await runAfterResponse(() => publishChange(channels, "roast_reservation.created"));
      }

      return result.reservation;
    } catch (error) {
      if (error instanceof CreateRoastReservationError) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.roastReservation.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: reservationInclude,
        });
        if (existing) return existing;
      }

      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível criar a reserva.");
}
