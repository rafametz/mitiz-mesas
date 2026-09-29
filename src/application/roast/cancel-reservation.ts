import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canTransitionRoastReservation } from "@/domain/roast/states";
import { recalculateReservedQuantity } from "./recalculate-reserved";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { publishChange } from "@/lib/realtime/publish";
import {
  restaurantRoastReservationsChannel,
  roastProductionDayChannel,
} from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class CancelRoastReservationError extends Error {}

const cancelReservationSchema = z.object({
  reservationId: z.string().min(1),
  cancelledById: z.string().min(1),
  reason: z.string().trim().min(1, "Informe o motivo do cancelamento").max(500),
});

export type CancelRoastReservationInput = z.input<typeof cancelReservationSchema>;

// Garçom cancela reserva PENDING diretamente, sem autorização do admin
// (decisão do usuário 2026-09-29) — sempre com motivo (regra 6). Libera a
// quantidade reservada de volta para o dia de produção.
export async function cancelRoastReservation(input: CancelRoastReservationInput) {
  const data = cancelReservationSchema.parse(input);

  const reservation = await prisma.$transaction(async (tx) => {
    const current = await tx.roastReservation.findUniqueOrThrow({
      where: { id: data.reservationId },
      include: { items: true },
    });

    if (!canTransitionRoastReservation(current.status, "CANCELLED")) {
      throw new CancelRoastReservationError(
        "Esta reserva não pode mais ser cancelada (só reserva pendente pode).",
      );
    }

    const updated = await tx.roastReservation.update({
      where: { id: current.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: data.cancelledById,
        cancelReason: data.reason,
      },
    });

    const productionIds = new Set(current.items.map((item) => item.roastProductionId));
    for (const productionId of productionIds) {
      await recalculateReservedQuantity(tx, productionId);
    }

    await writeAuditLog(tx, {
      restaurantId: current.restaurantId,
      userId: data.cancelledById,
      tableId: null,
      action: "roast_reservation.cancelled",
      entityType: "RoastReservation",
      entityId: current.id,
      metadata: { reason: data.reason },
    });

    return updated;
  });

  const channels = [
    roastProductionDayChannel(reservation.productionDayId),
    restaurantRoastReservationsChannel(reservation.restaurantId),
  ];
  await runAfterResponse(() => publishChange(channels, "roast_reservation.cancelled"));

  return reservation;
}
