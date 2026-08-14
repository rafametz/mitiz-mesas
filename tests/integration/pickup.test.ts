import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPickup } from "@/application/service-session/create-pickup";
import { createOrder } from "@/application/order/create-order";
import { authorizeCancelOrderItem } from "@/application/order/cancel-order-item";
import { registerPayment } from "@/application/service-session/register-payment";
import { requestClosing } from "@/application/service-session/request-closing";
import { closeTable } from "@/application/service-session/close-table";
import { ticketContentSchema } from "@/domain/printing/ticket";

// Módulo Retiradas (2026-08-14) — cobre o caminho que não existia antes:
// atendimento sem mesa. Reaproveita a mesma infraestrutura de teste dos
// demais arquivos de integração (banco real, limpeza em afterAll).
describe("Retiradas (módulo Retiradas — atendimento sem mesa)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let categoryId: string;
  let sectorId: string;
  let paymentMethodId: string;
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    categoryId = (
      await prisma.category.create({ data: { restaurantId, name: `Cat pickup ${suffix}` } })
    ).id;
    sectorId = (
      await prisma.productionSector.create({ data: { restaurantId, name: `Setor pickup ${suffix}` } })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Produto pickup ${suffix}`,
          price: "25.00",
        },
      })
    ).id;
    paymentMethodId = (
      await prisma.paymentMethod.create({ data: { restaurantId, name: `Forma pickup ${suffix}` } })
    ).id;
  });

  afterAll(async () => {
    await prisma.printJob.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.payment.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.orderItem.deleteMany({ where: { order: { serviceSessionId: { in: createdSessionIds } } } });
    await prisma.order.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.paymentMethod.deleteMany({ where: { id: paymentMethodId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it("cria a retirada sem mesa, tipo PICKUP, guestCount 1", async () => {
    const session = await createPickup({
      restaurantId,
      waiterId,
      customerName: "Rafael Teste",
      customerPhone: "11999998888",
      pickupOrigin: "WHATSAPP",
      requestedTime: "20:00",
      pickupNote: "Sem cebola",
    });
    createdSessionIds.push(session.id);

    expect(session.type).toBe("PICKUP");
    expect(session.tableId).toBeNull();
    expect(session.restaurantId).toBe(restaurantId);
    expect(session.guestCount).toBe(1);
    expect(session.customerName).toBe("Rafael Teste");
    expect(session.status).toBe("OPEN");
    expect(session.pickupNumber).toBeGreaterThan(0);
  });

  it("numeração é sequencial e nunca reinicia (decisão do usuário 2026-08-14)", async () => {
    const first = await createPickup({ restaurantId, waiterId, customerName: "Cliente A" });
    createdSessionIds.push(first.id);
    const second = await createPickup({ restaurantId, waiterId, customerName: "Cliente B" });
    createdSessionIds.push(second.id);

    expect(second.pickupNumber).toBe((first.pickupNumber ?? 0) + 1);
  });

  it("aceita pedido normalmente e o PrintJob traz o cabeçalho de retirada (não Mesa)", async () => {
    const session = await createPickup({ restaurantId, waiterId, customerName: "Cliente Pedido" });
    createdSessionIds.push(session.id);

    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `pickup-order-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 2 }],
    });

    const job = await prisma.printJob.findFirstOrThrow({
      where: { order: { serviceSessionId: session.id } },
    });
    const content = ticketContentSchema.parse(job.contentSnapshot);

    expect(content.type).toBe("NEW_ORDER");
    expect(content.tableNumber).toBeFalsy();
    expect(content.pickup).not.toBeNull();
    expect(content.pickup?.number).toBe(session.pickupNumber);
    expect(content.pickup?.customerName).toBe("Cliente Pedido");

    const updatedSession = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.subtotalAmount.toString()).toBe("50");
  });

  it("cancelamento de item também gera ticket com cabeçalho de retirada", async () => {
    const session = await createPickup({ restaurantId, waiterId, customerName: "Cliente Cancela" });
    createdSessionIds.push(session.id);

    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `pickup-cancel-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });

    await authorizeCancelOrderItem(order.items[0]!.id, waiterId, "Cliente desistiu do item");

    const cancelJob = await prisma.printJob.findFirstOrThrow({
      where: { order: { serviceSessionId: session.id }, type: "CANCELLATION" },
    });
    const content = ticketContentSchema.parse(cancelJob.contentSnapshot);
    expect(content.pickup?.customerName).toBe("Cliente Cancela");
  });

  it("pagamento e fechamento funcionam sem mesa (não mexe em Table)", async () => {
    const session = await createPickup({ restaurantId, waiterId, customerName: "Cliente Fecha" });
    createdSessionIds.push(session.id);

    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `pickup-close-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });

    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "25.00",
      idempotencyKey: `pickup-pay-${Date.now()}-${Math.random()}`,
    });

    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN"); // pagamento nunca muda o status sozinho.
    expect(current.balanceAmount.toString()).toBe("0");

    await requestClosing(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSING");

    await closeTable(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSED");
    expect(current.closedAt).not.toBeNull();
  });
});
