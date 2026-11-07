import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sellPdv } from "@/application/service-session/sell-pdv";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import { reversePdvSale, ReversePdvSaleError } from "@/application/pdv/reverse-sale";

// Teste de integração — estorno de venda do PDV (tela de gestão de
// vendas, pedido do usuário 2026-11-08: "foi feito uma venda errada...
// gostaria que fosse estornar esse valor"). Cancela todos os itens e
// estorna todos os pagamentos, zerando a sessão, sem apagar nada (regra
// 7/8).
describe("reversePdvSale", () => {
  let restaurantId: string;
  let userId: string;
  let productId: string;
  let pixMethodId: string;
  const createdSessionIds: string[] = [];
  const createdTableIds: string[] = [];
  let categoryId: string;
  let sectorId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    userId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria estorno ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor estorno ${suffix}` },
    });
    sectorId = sector.id;

    productId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Produto estorno ${suffix}`,
          price: "50.00",
        },
      })
    ).id;

    pixMethodId = (
      await prisma.paymentMethod.findFirstOrThrow({ where: { restaurantId, name: "PIX" } })
    ).id;
  });

  afterAll(async () => {
    // Escopado pelos ids de verdade criados neste arquivo (nunca por
    // restaurantId + entityType sozinhos — isso apagaria auditoria de
    // qualquer outra ação do restaurante inteiro, não só a deste teste).
    const [testItems, testPayments] = await Promise.all([
      prisma.orderItem.findMany({
        where: { order: { serviceSessionId: { in: createdSessionIds } } },
        select: { id: true },
      }),
      prisma.payment.findMany({
        where: { serviceSessionId: { in: createdSessionIds } },
        select: { id: true },
      }),
    ]);
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: "OrderItem", entityId: { in: testItems.map((i) => i.id) } },
          { entityType: "Payment", entityId: { in: testPayments.map((p) => p.id) } },
          { entityType: "ServiceSession", entityId: { in: createdSessionIds } },
        ],
      },
    });
    await prisma.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.payment.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  async function sellOne(quantity = 1) {
    const orderIdempotencyKey = `pdv-estorno-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId, quantity }],
      payments: [
        {
          paymentMethodId: pixMethodId,
          amount: 50 * quantity,
          idempotencyKey: `${orderIdempotencyKey}-pix`,
        },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);
    return order.serviceSessionId;
  }

  it("cancela os itens, estorna os pagamentos e zera a venda, com auditoria", async () => {
    const sessionId = await sellOne(2); // 100,00

    const before = await prisma.serviceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(before.totalAmount.toString()).toBe("100");

    const reversed = await reversePdvSale(sessionId, userId, "Venda lançada errada");

    expect(reversed.subtotalAmount.toString()).toBe("0");
    expect(reversed.discountAmount.toString()).toBe("0");
    expect(reversed.totalAmount.toString()).toBe("0");
    expect(reversed.paidAmount.toString()).toBe("0");
    expect(reversed.balanceAmount.toString()).toBe("0");
    // Status permanece CLOSED — a venda continua existindo no histórico,
    // só zerada (decisão do usuário: não apagar, só registrar que foi
    // estornada).
    expect(reversed.status).toBe("CLOSED");

    const items = await prisma.orderItem.findMany({ where: { order: { serviceSessionId: sessionId } } });
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("CANCELLED");
    expect(items[0]?.cancelReason).toBe("Venda lançada errada");

    const payments = await prisma.payment.findMany({ where: { serviceSessionId: sessionId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.voidedAt).not.toBeNull();
    expect(payments[0]?.voidReason).toBe("Venda lançada errada");

    const saleLog = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "ServiceSession", entityId: sessionId, action: "pdv_sale.reversed" },
    });
    expect(saleLog.userId).toBe(userId);
    const metadata = saleLog.metadata as Record<string, unknown>;
    expect(metadata.itemsCancelled).toBe(1);
    expect(metadata.paymentsVoided).toBe(1);
    expect(metadata.amount).toBe("100");
  });

  it("rejeita estornar a mesma venda duas vezes", async () => {
    const sessionId = await sellOne(1);
    await reversePdvSale(sessionId, userId, "Primeiro estorno");

    await expect(reversePdvSale(sessionId, userId, "Segundo estorno")).rejects.toThrow(
      ReversePdvSaleError,
    );
  });

  it("rejeita estornar um atendimento que não é do PDV", async () => {
    const table = await prisma.table.create({
      data: { restaurantId, number: `ESTORNO-${Date.now()}` },
    });
    createdTableIds.push(table.id);
    const tableSession = await openTable({ tableId: table.id, waiterId: userId, guestCount: 2 });
    createdSessionIds.push(tableSession.id);
    await createOrder({
      serviceSessionId: tableSession.id,
      waiterId: userId,
      idempotencyKey: `key-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });

    await expect(reversePdvSale(tableSession.id, userId, "Não é PDV")).rejects.toThrow(
      ReversePdvSaleError,
    );
  });

  it("rejeita motivo vazio ou muito curto", async () => {
    const sessionId = await sellOne(1);
    await expect(reversePdvSale(sessionId, userId, "a")).rejects.toThrow();
  });
});
