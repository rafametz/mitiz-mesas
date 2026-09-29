import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createRoastReservation,
  CreateRoastReservationError,
} from "@/application/roast/create-reservation";
import { editRoastReservation, EditRoastReservationError } from "@/application/roast/edit-reservation";
import { cancelRoastReservation, CancelRoastReservationError } from "@/application/roast/cancel-reservation";
import {
  deliverRoastReservation,
  DeliverRoastReservationError,
} from "@/application/roast/deliver-reservation";

// Módulo Reservas de Assados (2026-09-29) — cobre especialmente o
// requisito central do usuário: nunca deixar reservar mais do que o
// planejado, mesmo sob concorrência (duas reservas disputando a última
// unidade ao mesmo tempo).
describe("Reservas de Assados", () => {
  let restaurantId: string;
  let waiterId: string;
  let roastProductId: string;
  const productionDayIds: string[] = [];
  const roastProductIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  async function makeProductionDay(date: string, plannedQuantity: number) {
    const day = await prisma.roastProductionDay.create({ data: { restaurantId, date } });
    productionDayIds.push(day.id);
    await prisma.roastProduction.create({
      data: { productionDayId: day.id, roastProductId, plannedQuantity },
    });
    return day;
  }

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const product = await prisma.roastProduct.create({
      data: { restaurantId, name: `Costela teste ${suffix}`, unit: "kg" },
    });
    roastProductId = product.id;
    roastProductIds.push(product.id);
  });

  afterAll(async () => {
    await prisma.roastReservationItem.deleteMany({
      where: { roastProduction: { productionDayId: { in: productionDayIds } } },
    });
    await prisma.roastReservation.deleteMany({ where: { productionDayId: { in: productionDayIds } } });
    await prisma.roastProduction.deleteMany({ where: { productionDayId: { in: productionDayIds } } });
    await prisma.roastProductionDay.deleteMany({ where: { id: { in: productionDayIds } } });
    await prisma.roastProduct.deleteMany({ where: { id: { in: roastProductIds } } });
    await prisma.$disconnect();
  });

  it("cria reserva e atualiza reservedQuantity", async () => {
    const day = await makeProductionDay(`2030-01-01-${suffix}`, 10);

    const reservation = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey: `roast-create-${Date.now()}-${Math.random()}`,
      customerName: "Cliente Teste",
      items: [{ roastProductId, quantity: 4 }],
    });

    expect(reservation.status).toBe("PENDING");
    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("4");
  });

  it("rejeita reserva acima do disponível", async () => {
    const day = await makeProductionDay(`2030-01-02-${suffix}`, 5);

    await expect(
      createRoastReservation({
        restaurantId,
        productionDayId: day.id,
        waiterId,
        idempotencyKey: `roast-over-${Date.now()}-${Math.random()}`,
        customerName: "Cliente Excede",
        items: [{ roastProductId, quantity: 6 }],
      }),
    ).rejects.toThrow(CreateRoastReservationError);

    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("0");
  });

  it("idempotência: mesma chave não duplica a reserva", async () => {
    const day = await makeProductionDay(`2030-01-03-${suffix}`, 10);
    const idempotencyKey = `roast-idem-${Date.now()}-${Math.random()}`;

    const first = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey,
      customerName: "Cliente Idempotente",
      items: [{ roastProductId, quantity: 2 }],
    });
    const second = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey,
      customerName: "Cliente Idempotente",
      items: [{ roastProductId, quantity: 2 }],
    });

    expect(second.id).toBe(first.id);
    const count = await prisma.roastReservation.count({ where: { productionDayId: day.id } });
    expect(count).toBe(1);
    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("2");
  });

  it("impede overbooking sob concorrência (duas reservas disputando a última unidade)", async () => {
    const day = await makeProductionDay(`2030-01-04-${suffix}`, 5);

    const results = await Promise.allSettled([
      createRoastReservation({
        restaurantId,
        productionDayId: day.id,
        waiterId,
        idempotencyKey: `roast-race-a-${Date.now()}-${Math.random()}`,
        customerName: "Cliente A",
        items: [{ roastProductId, quantity: 3 }],
      }),
      createRoastReservation({
        restaurantId,
        productionDayId: day.id,
        waiterId,
        idempotencyKey: `roast-race-b-${Date.now()}-${Math.random()}`,
        customerName: "Cliente B",
        items: [{ roastProductId, quantity: 3 }],
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    // Nunca reservado além do planejado (5) — a prova central deste teste.
    expect(production.reservedQuantity.lessThanOrEqualTo(5)).toBe(true);
    expect(production.reservedQuantity.toString()).toBe("3");
  });

  it("editar reserva ajusta reservedQuantity corretamente (para mais e para menos)", async () => {
    const day = await makeProductionDay(`2030-01-05-${suffix}`, 10);
    const reservation = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey: `roast-edit-${Date.now()}-${Math.random()}`,
      customerName: "Cliente Edita",
      items: [{ roastProductId, quantity: 4 }],
    });

    await editRoastReservation({
      reservationId: reservation.id,
      editedById: waiterId,
      customerName: "Cliente Edita",
      items: [{ roastProductId, quantity: 7 }],
    });
    let production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("7");

    await editRoastReservation({
      reservationId: reservation.id,
      editedById: waiterId,
      customerName: "Cliente Edita",
      items: [{ roastProductId, quantity: 2 }],
    });
    production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("2");
  });

  it("cancelar reserva libera reservedQuantity e exige motivo", async () => {
    const day = await makeProductionDay(`2030-01-06-${suffix}`, 10);
    const reservation = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey: `roast-cancel-${Date.now()}-${Math.random()}`,
      customerName: "Cliente Cancela",
      items: [{ roastProductId, quantity: 3 }],
    });

    await expect(
      cancelRoastReservation({ reservationId: reservation.id, cancelledById: waiterId, reason: "" }),
    ).rejects.toThrow();

    const cancelled = await cancelRoastReservation({
      reservationId: reservation.id,
      cancelledById: waiterId,
      reason: "Cliente desistiu",
    });
    expect(cancelled.status).toBe("CANCELLED");

    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("0");

    await expect(
      cancelRoastReservation({
        reservationId: reservation.id,
        cancelledById: waiterId,
        reason: "De novo",
      }),
    ).rejects.toThrow(CancelRoastReservationError);
  });

  it("entregar reserva é definitivo: não pode mais editar ou cancelar depois", async () => {
    const day = await makeProductionDay(`2030-01-07-${suffix}`, 10);
    const reservation = await createRoastReservation({
      restaurantId,
      productionDayId: day.id,
      waiterId,
      idempotencyKey: `roast-deliver-${Date.now()}-${Math.random()}`,
      customerName: "Cliente Entrega",
      items: [{ roastProductId, quantity: 2 }],
    });

    const delivered = await deliverRoastReservation({
      reservationId: reservation.id,
      deliveredById: waiterId,
    });
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.deliveredAt).not.toBeNull();

    await expect(
      deliverRoastReservation({ reservationId: reservation.id, deliveredById: waiterId }),
    ).rejects.toThrow(DeliverRoastReservationError);

    await expect(
      cancelRoastReservation({
        reservationId: reservation.id,
        cancelledById: waiterId,
        reason: "Tentando cancelar entregue",
      }),
    ).rejects.toThrow(CancelRoastReservationError);

    await expect(
      editRoastReservation({
        reservationId: reservation.id,
        editedById: waiterId,
        customerName: "Cliente Entrega",
        items: [{ roastProductId, quantity: 1 }],
      }),
    ).rejects.toThrow(EditRoastReservationError);

    // reservedQuantity permanece contando a reserva entregue (nunca foi
    // liberada — entregar não é cancelar).
    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.reservedQuantity.toString()).toBe("2");
  });
});
