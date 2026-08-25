import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import { requestClosing } from "@/application/service-session/request-closing";
import { transferTable, TransferTableError } from "@/application/service-session/transfer-table";

// Teste de integração — "Trocar de mesa" (CLAUDE.md seção 10, 2026-08-21,
// pedido do usuário): mover um atendimento ativo inteiro pra outra mesa
// livre, sem fechar/reabrir nada. Cobre exatamente o cenário do
// enunciado: mesa cheia de pedidos migrando pra uma mesa livre, com
// pedidos/itens/pessoas/horários intactos.
describe("Trocar de mesa (transferTable)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  const createdTableIds: string[] = [];
  let categoryId: string;
  let sectorId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria troca ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor troca ${suffix}` },
    });
    sectorId = sector.id;
    const product = await prisma.product.create({
      data: {
        restaurantId,
        categoryId,
        defaultSectorId: sector.id,
        name: `Produto troca ${suffix}`,
        price: "50.00",
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.printJob.deleteMany({
      where: { order: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.auditLog.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.guest.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  async function createTable(prefix: string) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    return table;
  }

  it("move o atendimento pra mesa nova sem alterar pedidos, itens, pessoas nem horários", async () => {
    const fromTable = await createTable("TROCA-DE");
    const toTable = await createTable("TROCA-PARA");

    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 4 });
    const guest = await prisma.guest.create({
      data: { serviceSessionId: session.id, name: "Cliente", sortOrder: 0 },
    });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `troca-pedido-${session.id}`,
      items: [{ productId, quantity: 2, guestId: guest.id }],
    });
    const originalItemCreatedAt = order.items[0]!.createdAt.getTime();

    const result = await transferTable(
      { serviceSessionId: session.id, destinationTableId: toTable.id },
      waiterId,
    );
    expect(result).toEqual({ restaurantId, fromTableId: fromTable.id, toTableId: toTable.id });

    // Mesa antiga livre, mesa nova ocupada.
    const fromAfter = await prisma.table.findUniqueOrThrow({ where: { id: fromTable.id } });
    const toAfter = await prisma.table.findUniqueOrThrow({ where: { id: toTable.id } });
    expect(fromAfter.status).toBe("FREE");
    expect(toAfter.status).toBe("OCCUPIED");

    // O atendimento agora aponta pra mesa nova.
    const sessionAfter = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.tableId).toBe(toTable.id);
    expect(sessionAfter.status).toBe("OPEN"); // status do atendimento não muda.

    // Pedido, item, pessoa e horário original intactos — nada foi
    // recriado nem retocado.
    const itemAfter = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(itemAfter.quantity).toBe(2);
    expect(itemAfter.guestId).toBe(guest.id);
    expect(itemAfter.createdAt.getTime()).toBe(originalItemCreatedAt);
    const guestAfter = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(guestAfter.serviceSessionId).toBe(session.id);

    // Auditoria registrada com origem e destino.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: session.id, action: "service_session.table_transferred" },
    });
    expect(audit.tableId).toBe(fromTable.id);
    expect(audit.metadata).toMatchObject({
      fromTableId: fromTable.id,
      fromTableNumber: fromTable.number,
      toTableId: toTable.id,
      toTableNumber: toTable.number,
    });
  });

  it("continua aceitando pedido novo na mesa nova depois da troca", async () => {
    const fromTable = await createTable("TROCA-DE");
    const toTable = await createTable("TROCA-PARA");
    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 2 });

    await transferTable({ serviceSessionId: session.id, destinationTableId: toTable.id }, waiterId);

    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `pos-troca-${session.id}`,
      items: [{ productId, quantity: 1 }],
    });
    expect(order.status).toBe("SENT");

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.totalAmount.toString()).toBe("50");
  });

  it("mesa em fechamento solicitado (CLOSING) move pra mesa nova como WAITING_CLOSING", async () => {
    const fromTable = await createTable("TROCA-DE");
    const toTable = await createTable("TROCA-PARA");
    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 2 });
    await requestClosing(session.id, waiterId);

    await transferTable({ serviceSessionId: session.id, destinationTableId: toTable.id }, waiterId);

    const toAfter = await prisma.table.findUniqueOrThrow({ where: { id: toTable.id } });
    expect(toAfter.status).toBe("WAITING_CLOSING");
    const sessionAfter = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.status).toBe("CLOSING");
  });

  it("rejeita mesa de destino que não está livre", async () => {
    const fromTable = await createTable("TROCA-DE");
    const occupiedTable = await createTable("TROCA-OCUPADA");
    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 2 });
    await openTable({ tableId: occupiedTable.id, waiterId, guestCount: 2 }); // ocupa o destino

    await expect(
      transferTable({ serviceSessionId: session.id, destinationTableId: occupiedTable.id }, waiterId),
    ).rejects.toThrow(TransferTableError);

    // Nada mudou.
    const sessionAfter = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(sessionAfter.tableId).toBe(fromTable.id);
  });

  it("rejeita trocar pra própria mesa", async () => {
    const fromTable = await createTable("TROCA-DE");
    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 2 });

    await expect(
      transferTable({ serviceSessionId: session.id, destinationTableId: fromTable.id }, waiterId),
    ).rejects.toThrow(TransferTableError);
  });

  it("rejeita atendimento já fechado", async () => {
    const fromTable = await createTable("TROCA-DE");
    const toTable = await createTable("TROCA-PARA");
    const session = await openTable({ tableId: fromTable.id, waiterId, guestCount: 1 });
    await requestClosing(session.id, waiterId);
    await prisma.serviceSession.update({
      where: { id: session.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    await expect(
      transferTable({ serviceSessionId: session.id, destinationTableId: toTable.id }, waiterId),
    ).rejects.toThrow(TransferTableError);
  });
});
