import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/application/order/create-order";
import { openTable } from "@/application/service-session/open-table";
import { updateOrderItemStatus, UpdateItemStatusError } from "@/application/production/update-item-status";

describe("updateOrderItemStatus (Módulo 6 — produção)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let categoryId: string;
  let sectorAId: string;
  let sectorBId: string;
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    categoryId = (
      await prisma.category.create({ data: { restaurantId, name: `Cat producao ${suffix}` } })
    ).id;
    sectorAId = (
      await prisma.productionSector.create({ data: { restaurantId, name: `Setor A ${suffix}` } })
    ).id;
    sectorBId = (
      await prisma.productionSector.create({ data: { restaurantId, name: `Setor B ${suffix}` } })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorAId,
          name: `Produto producao ${suffix}`,
          price: "20.00",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { productId } });
    // PrintJob (Módulo 7) nasce junto com o pedido — precisa sair antes do
    // Order por causa do onDelete: Restrict.
    await prisma.printJob.deleteMany({
      where: { order: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productionSector.deleteMany({ where: { id: { in: [sectorAId, sectorBId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  async function openTableWithOrder(quantity = 1) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `PROD-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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

  // Pedido com 2 itens (linhas separadas) — para observar o estágio
  // intermediário RECEIVED, que só existe enquanto AINDA HÁ item parado em
  // SENT (um pedido de item único pula direto para IN_PREPARATION, porque
  // não sobra nenhum item "só recebido" quando o único item já começou).
  async function openTableWithTwoItemOrder() {
    const table = await prisma.table.create({
      data: { restaurantId, number: `PROD2-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      items: [
        { productId, quantity: 1 },
        { productId, quantity: 1 },
      ],
    });
    return { session, order, items: order.items };
  }

  it("avança o item pela esteira: SENT -> IN_PREPARATION -> READY -> DELIVERED", async () => {
    const { item } = await openTableWithOrder();

    const inPrep = await updateOrderItemStatus(item.id, "IN_PREPARATION");
    expect(inPrep.status).toBe("IN_PREPARATION");

    const ready = await updateOrderItemStatus(item.id, "READY");
    expect(ready.status).toBe("READY");

    const delivered = await updateOrderItemStatus(item.id, "DELIVERED");
    expect(delivered.status).toBe("DELIVERED");
  });

  it("rejeita pular etapa (SENT direto para READY)", async () => {
    const { item } = await openTableWithOrder();
    await expect(updateOrderItemStatus(item.id, "READY")).rejects.toThrow(UpdateItemStatusError);
  });

  it("rejeita avançar item já entregue", async () => {
    const { item } = await openTableWithOrder();
    await updateOrderItemStatus(item.id, "IN_PREPARATION");
    await updateOrderItemStatus(item.id, "READY");
    await updateOrderItemStatus(item.id, "DELIVERED");

    await expect(updateOrderItemStatus(item.id, "DELIVERED")).rejects.toThrow(
      UpdateItemStatusError,
    );
  });

  it("pedido de item único pula RECEIVED e vai direto para IN_PREPARATION (não sobra item só recebido)", async () => {
    const { order, item } = await openTableWithOrder();

    await updateOrderItemStatus(item.id, "IN_PREPARATION");
    const reloadedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(reloadedOrder.status).toBe("IN_PREPARATION");
  });

  it(
    "pedido de 2 itens fica RECEIVED enquanto um item começou e o outro ainda está SENT, e só some para DELIVERED quando os dois terminam",
    // 6 chamadas sequenciais (cada uma é uma transação de verdade contra o
    // Supabase) — acima do timeout padrão de 5s deste ambiente (mesma
    // latência de rede documentada nos outros testes de integração).
    { timeout: 20000 },
    async () => {
      const { order, items } = await openTableWithTwoItemOrder();
      const [first, second] = items;

      await updateOrderItemStatus(first!.id, "IN_PREPARATION");
      let reloadedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(reloadedOrder.status).toBe("RECEIVED"); // 2º item ainda em SENT

      await updateOrderItemStatus(second!.id, "IN_PREPARATION");
      await updateOrderItemStatus(first!.id, "READY");
      await updateOrderItemStatus(second!.id, "READY");
      await updateOrderItemStatus(first!.id, "DELIVERED");
      reloadedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(reloadedOrder.status).toBe("READY"); // 2º item ainda não foi entregue

      await updateOrderItemStatus(second!.id, "DELIVERED");
      reloadedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(reloadedOrder.status).toBe("DELIVERED");
    },
  );

  it("item de um setor não deveria aparecer na fila de outro setor (escopo por setor)", async () => {
    const { item } = await openTableWithOrder();

    // O produto usado no teste tem defaultSectorId = sectorAId — confirma
    // que o item herdou o setor certo e que outro setor não teria como
    // enxergá-lo numa consulta filtrada por sectorId (é isso que a tela de
    // produção faz — ver src/app/(staff)/producao/[sectorId]/page.tsx).
    const reloadedItem = await prisma.orderItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(reloadedItem.sectorId).toBe(sectorAId);

    const itemsInOtherSector = await prisma.orderItem.findMany({
      where: { sectorId: sectorBId, id: item.id },
    });
    expect(itemsInOtherSector).toHaveLength(0);
  });
});
