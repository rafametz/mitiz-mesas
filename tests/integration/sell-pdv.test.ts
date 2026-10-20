import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sellPdv, SellPdvError } from "@/application/service-session/sell-pdv";

// Teste de integração — venda de balcão pura do PDV (Módulo 17, Passo 3 do
// backlog): sem consumo de mesa envolvido (ver register-combined-checkout
// para esse caso). Cobre o núcleo compartilhado (sellPdvInTx) que o
// checkout combinado também usa para a perna da loja.
describe("sellPdv", () => {
  let restaurantId: string;
  let userId: string;
  let picanhaId: string;
  let pixMethodId: string;
  let dinheiroMethodId: string;
  const createdSessionIds: string[] = [];
  let categoryId: string;
  let sectorId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    userId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria pdv ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor pdv ${suffix}` },
    });
    sectorId = sector.id;

    picanhaId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Picanha pdv ${suffix}`,
          price: "110.00",
        },
      })
    ).id;

    pixMethodId = (
      await prisma.paymentMethod.findFirstOrThrow({ where: { restaurantId, name: "PIX" } })
    ).id;
    dinheiroMethodId = (
      await prisma.paymentMethod.findFirstOrThrow({ where: { restaurantId, name: "Dinheiro" } })
    ).id;
  });

  afterAll(async () => {
    await prisma.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.payment.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId: picanhaId } });
    await prisma.order.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.product.deleteMany({ where: { id: picanhaId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  it("vende, recebe por duas formas de pagamento e fecha a sessão sozinha", async () => {
    const orderIdempotencyKey = `pdv-venda-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaId, quantity: 1 }],
      payments: [
        { paymentMethodId: pixMethodId, amount: 44, idempotencyKey: `${orderIdempotencyKey}-pix` },
        {
          paymentMethodId: dinheiroMethodId,
          amount: 66,
          idempotencyKey: `${orderIdempotencyKey}-dinheiro`,
        },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);

    const session = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: order.serviceSessionId },
    });
    expect(session.type).toBe("PDV");
    expect(session.status).toBe("CLOSED");
    expect(session.totalAmount.toString()).toBe("110");
    expect(session.balanceAmount.toString()).toBe("0");

    const payments = await prisma.payment.findMany({ where: { serviceSessionId: session.id } });
    expect(payments).toHaveLength(2);
    expect(payments.every((p) => p.combinedCheckoutId === null)).toBe(true);

    // Repetir a mesma chave do pedido (duplo toque em "Confirmar") devolve
    // a mesma venda, sem criar uma segunda sessão nem duplicar pagamento.
    const retry = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaId, quantity: 1 }],
      payments: [
        {
          paymentMethodId: pixMethodId,
          amount: 110,
          idempotencyKey: `retry-${orderIdempotencyKey}`,
        },
      ],
    });
    expect(retry.id).toBe(order.id);
    const paymentsAfterRetry = await prisma.payment.count({
      where: { serviceSessionId: session.id },
    });
    expect(paymentsAfterRetry).toBe(2);
  });

  it("rejeita quando o pagamento não cobre o valor total da venda", async () => {
    const orderIdempotencyKey = `pdv-insuficiente-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await expect(
      sellPdv(userId, {
        restaurantId,
        waiterId: userId,
        orderIdempotencyKey,
        items: [{ productId: picanhaId, quantity: 1 }],
        payments: [
          {
            paymentMethodId: pixMethodId,
            amount: 50,
            idempotencyKey: `${orderIdempotencyKey}-pix`,
          },
        ],
      }),
    ).rejects.toThrow(SellPdvError);

    const session = await prisma.serviceSession.findFirst({
      where: { orders: { some: { idempotencyKey: orderIdempotencyKey } } },
    });
    if (session) createdSessionIds.push(session.id);
  });
});
