import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrder, CreateOrderError } from "@/application/order/create-order";
import { openTable } from "@/application/service-session/open-table";

describe("createOrder", () => {
  let restaurantId: string;
  let waiterId: string;
  let categoryId: string;
  let sectorId: string;
  let productId: string;
  let modifierId: string;
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria teste ${suffix}` },
    });
    categoryId = category.id;

    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor teste ${suffix}` },
    });
    sectorId = sector.id;

    const product = await prisma.product.create({
      data: {
        restaurantId,
        categoryId,
        defaultSectorId: sectorId,
        name: `Produto teste ${suffix}`,
        price: "29.90",
      },
    });
    productId = product.id;

    const group = await prisma.productModifierGroup.create({
      data: { productId, name: "Grupo teste", maxSelect: 1 },
    });
    const modifier = await prisma.productModifier.create({
      data: { groupId: group.id, name: "Adicional teste", priceDelta: "5.00" },
    });
    modifierId = modifier.id;
  });

  afterAll(async () => {
    await prisma.orderItemModifier.deleteMany({
      where: { modifier: { group: { productId } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.productModifier.deleteMany({ where: { id: modifierId } });
    await prisma.productModifierGroup.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  async function openFreshTable() {
    const table = await prisma.table.create({
      data: {
        restaurantId,
        number: `PEDIDO-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 2 });
    return session;
  }

  it("cria o pedido, congela preço/nome/setor e recalcula o subtotal da comanda", async () => {
    const session = await openFreshTable();

    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 2, modifierIds: [modifierId] }],
    });

    expect(order.status).toBe("SENT");
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.sectorId).toBe(sectorId);
    expect(order.items[0]?.unitPrice.toString()).toBe("29.9");
    expect(order.items[0]?.modifiers[0]?.priceDeltaAtOrder.toString()).toBe("5");

    // subtotal = (29.90 + 5.00) * 2 = 69.80
    const updatedSession = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.subtotalAmount.toString()).toBe("69.8");
    expect(updatedSession.totalAmount.toString()).toBe("69.8");
    expect(updatedSession.balanceAmount.toString()).toBe("69.8");
  });

  it("é idempotente: mesma chave não duplica o pedido", async () => {
    const session = await openFreshTable();
    const idempotencyKey = `idem-${Date.now()}-${Math.random()}`;

    const first = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey,
      items: [{ productId, quantity: 1 }],
    });
    const second = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey,
      items: [{ productId, quantity: 1 }],
    });

    expect(second.id).toBe(first.id);

    const orderCount = await prisma.order.count({ where: { serviceSessionId: session.id } });
    expect(orderCount).toBe(1);
  });

  it("rejeita pedido para produto indisponível", async () => {
    const session = await openFreshTable();
    const unavailable = await prisma.product.create({
      data: {
        restaurantId,
        categoryId,
        defaultSectorId: sectorId,
        name: `Indisponível ${Date.now()}`,
        price: "10.00",
        available: false,
      },
    });

    await expect(
      createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-${Date.now()}-${Math.random()}`,
        items: [{ productId: unavailable.id, quantity: 1 }],
      }),
    ).rejects.toThrow(CreateOrderError);

    await prisma.product.delete({ where: { id: unavailable.id } });
  });

  it("alterar o preço do produto não muda o pedido já lançado (regra 9/10)", async () => {
    const session = await openFreshTable();
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });
    const originalUnitPrice = order.items[0]!.unitPrice.toString();

    await prisma.product.update({ where: { id: productId }, data: { price: "999.99" } });

    const reloadedItem = await prisma.orderItem.findUniqueOrThrow({
      where: { id: order.items[0]!.id },
    });
    expect(reloadedItem.unitPrice.toString()).toBe(originalUnitPrice);
    expect(reloadedItem.unitPrice.toString()).not.toBe("999.99");

    // restaura para não afetar outros testes deste arquivo
    await prisma.product.update({ where: { id: productId }, data: { price: "29.90" } });
  });
});
