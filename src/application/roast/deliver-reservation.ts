import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canTransitionRoastReservation } from "@/domain/roast/states";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { publishChange } from "@/lib/realtime/publish";
import {
  restaurantRoastReservationsChannel,
  roastProductionDayChannel,
} from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class DeliverRoastReservationError extends Error {}

const deliverReservationSchema = z.object({
  reservationId: z.string().min(1),
  deliveredById: z.string().min(1),
});

export type DeliverRoastReservationInput = z.input<typeof deliverReservationSchema>;

// Marca a reserva como entregue — definitivo no v1, sem reabertura
// (decisão do usuário 2026-09-29). Não mexe em reservedQuantity: a
// quantidade já estava contada desde a criação, entregar não libera nem
// consome nada a mais.
export async function deliverRoastReservation(input: DeliverRoastReservationInput) {
  const data = deliverReservationSchema.parse(input);

  const reservation = await prisma.$transaction(async (tx) => {
    const current = await tx.roastReservation.findUniqueOrThrow({
      where: { id: data.reservationId },
    });

    if (!canTransitionRoastReservation(current.status, "DELIVERED")) {
      throw new DeliverRoastReservationError(
        "Esta reserva não pode ser marcada como entregue (só reserva pendente pode).",
      );
    }

    const updated = await tx.roastReservation.update({
      where: { id: current.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        deliveredById: data.deliveredById,
      },
    });

    await writeAuditLog(tx, {
      restaurantId: current.restaurantId,
      userId: data.deliveredById,
      tableId: null,
      action: "roast_reservation.delivered",
      entityType: "RoastReservation",
      entityId: current.id,
    });

    return updated;
  });

  const channels = [
    roastProductionDayChannel(reservation.productionDayId),
    restaurantRoastReservationsChannel(reservation.restaurantId),
  ];
  await runAfterResponse(() => publishChange(channels, "roast_reservation.delivered"));

  return reservation;
}
