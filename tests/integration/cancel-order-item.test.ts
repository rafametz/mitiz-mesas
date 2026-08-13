import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/application/order/create-order";
import { openTable } from "@/application/service-session/open-table";
import {
  authorizeCancelOrderItem,
  CancelOrderItemError,
  requestCancelOrderItem,
} from "@/application/order/cancel-order-item";

describe("cancelamento de item de pedido", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let categoryId: string;
  let sectorId: string;
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    categoryId = (
      await prisma.category.create({ data: { restaurantId, name: `Cat cancel ${suffix}` } })
    ).id;
    sectorId = (
      await prisma.productionSector.create({
        data: { restaurantId, name: `Setor cancel ${suffix}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Produto cancel ${suffix}`,
          price: "15.00",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { productId } });
    // PrintJob (Módulo 7) nasce junto com o pedido/cancelamento — precisa
    // sair antes do Order por causa do onDelete: Restrict.
    await prisma.printJob.deleteMany({
      where: { order: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  async function openTableWithOrder(quantity = 1) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `CANC-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity }],
    });
    return { session, order, item: order.items[0]! };
  }

  it("autoriza cancelamento direto de SENT, registra auditoria e recalcula o saldo", async () => {
    const { session, item } = await openTableWithOrder(2); // subtotal inicial: 30.00

    const cancelled = await authorizeCancelOrderItem(item.id, waiterId, "Cliente desistiu");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("Cliente desistiu");
    expect(cancelled.cancelledById).toBe(waiterId);
    expect(cancelled.cancelledAt).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityType: "OrderItem", entityId: item.id, action: "order_item.cancelled" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.userId).toBe(waiterId);
    expect(auditLog?.tableId).toBe(session.tableId);

    const updatedSession = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.subtotalAmount.toString()).toBe("0");
  });

  it("item cancelado nunca é apagado (regra 7)", async () => {
    const { item } = await openTableWithOrder(1);
    await authorizeCancelOrderItem(item.id, waiterId, "Erro no lançamento");

    const stillExists = await prisma.orderItem.findUnique({ where: { id: item.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists?.status).toBe("CANCELLED");
  });

  it("fluxo de duas etapas: solicitar depois autorizar", async () => {
    const { item } = await openTableWithOrder(1);

    const requested = await requestCancelOrderItem(item.id, waiterId, "Cliente pediu para tirar");
    expect(requested.status).toBe("CANCELLATION_REQUESTED");
    expect(requested.cancelledAt).toBeNull(); // ainda não foi autorizado

    const authorized = await authorizeCancelOrderItem(
      item.id,
      waiterId,
      "Confirmado com o cliente",
    );
    expect(authorized.status).toBe("CANCELLED");
  });

  it("rejeita cancelar item já cancelado", async () => {
    const { item } = await openTableWithOrder(1);
    await authorizeCancelOrderItem(item.id, waiterId, "Motivo 1");

    await expect(authorizeCancelOrderItem(item.id, waiterId, "Motivo 2")).rejects.toThrow(
      CancelOrderItemError,
    );
  });

  it("todos os itens do pedido cancelados marca o pedido como CANCELLED", async () => {
    const { order, item } = await openTableWithOrder(1);
    await authorizeCancelOrderItem(item.id, waiterId, "Único item cancelado");

    const reloadedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloadedOrder.status).toBe("CANCELLED");
  });
});
