import "server-only";
import { prisma } from "@/lib/prisma";
import { buildRoastReservationTicketContent } from "@/domain/printing/roast-reservation-ticket";

// Ticket de reserva de assado (módulo Reservas de Assados, 2026-10-04,
// pedido do usuário) — mesmo mecanismo de fila/agente já usado para pedido
// de mesa (Módulo 7), mas sem Order nem setor: é sobre a reserva em si.
// Chamada via runAfterResponse depois que create-reservation.ts já
// confirmou a reserva ao garçom (mesmo racional de createPrintJobsForOrder
// em create-order.ts) — falha aqui nunca derruba a reserva já criada.
export async function createRoastReservationPrintJob(reservationId: string) {
  const reservation = await prisma.roastReservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { restaurant: true, waiter: true, productionDay: true, items: true },
  });

  const printer = await prisma.printer.findFirst({
    where: { restaurantId: reservation.restaurantId, active: true },
  });

  const content = buildRoastReservationTicketContent({
    restaurantName: reservation.restaurant.name,
    customerName: reservation.customerName,
    customerPhone: reservation.customerPhone,
    productionDayDateLabel: reservation.productionDay.date.split("-").reverse().join("/"),
    waiterName: reservation.waiter.name,
    notes: reservation.notes,
    items: reservation.items.map((item) => ({
      productName: item.productNameAtReservation,
      quantity: item.quantity.toNumber(),
      unit: item.unitAtReservation,
    })),
  });

  return prisma.printJob.create({
    data: {
      roastReservationId: reservation.id,
      printerId: printer?.id,
      type: "ROAST_RESERVATION",
      contentSnapshot: content,
    },
  });
}
