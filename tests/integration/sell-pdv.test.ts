import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sellPdv, SellPdvError } from "@/application/service-session/sell-pdv";
import { CreateOrderError } from "@/application/order/create-order";

// Teste de integração — venda de balcão pura do PDV (Módulo 17, Passo 3 do
// backlog): sem consumo de mesa envolvido (ver register-combined-checkout
// para esse caso). Cobre o núcleo compartilhado (sellPdvInTx) que o
// checkout combinado também usa para a perna da loja.
describe("sellPdv", () => {
  let restaurantId: string;
  let userId: string;
  let picanhaId: string;
  let picanhaKgId: string;
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

    // Produto por quilo (pedido do usuário, 2026-11-07) — price é preço
    // por kg; unit "KG" é o que libera weightQuantity em createOrderInTx.
    picanhaKgId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Picanha a quilo pdv ${suffix}`,
          price: "59.90",
          unit: "KG",
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
    await prisma.discount.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.payment.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSessionId: { in: createdSessionIds } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId: { in: [picanhaId, picanhaKgId] } } });
    await prisma.order.deleteMany({ where: { serviceSessionId: { in: createdSessionIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [picanhaId, picanhaKgId] } } });
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

  it("aplica desconto fixo antes de cobrar — saldo fecha com subtotal menos desconto (pedido do usuário, 2026-11-06)", async () => {
    const orderIdempotencyKey = `pdv-desconto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaId, quantity: 1 }], // 110
      discount: { value: 10, reason: "Cliente fidelizado, arredondar conta" },
      payments: [
        { paymentMethodId: pixMethodId, amount: 100, idempotencyKey: `${orderIdempotencyKey}-pix` },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);

    const session = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: order.serviceSessionId },
    });
    expect(session.status).toBe("CLOSED");
    expect(session.subtotalAmount.toString()).toBe("110");
    expect(session.discountAmount.toString()).toBe("10");
    expect(session.totalAmount.toString()).toBe("100");
    expect(session.balanceAmount.toString()).toBe("0");

    const discount = await prisma.discount.findFirstOrThrow({
      where: { serviceSessionId: order.serviceSessionId },
    });
    expect(discount.type).toBe("FIXED_AMOUNT");
    expect(discount.amountApplied.toString()).toBe("10");
    expect(discount.reason).toBe("Cliente fidelizado, arredondar conta");
    expect(discount.appliedById).toBe(userId);
  });

  it("motivo do desconto é opcional — em branco grava um texto padrão (pedido do usuário, 2026-11-06)", async () => {
    const orderIdempotencyKey = `pdv-desconto-sem-motivo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaId, quantity: 1 }], // 110
      discount: { value: 5 }, // sem reason
      payments: [
        { paymentMethodId: pixMethodId, amount: 105, idempotencyKey: `${orderIdempotencyKey}-pix` },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);

    const discount = await prisma.discount.findFirstOrThrow({
      where: { serviceSessionId: order.serviceSessionId },
    });
    expect(discount.amountApplied.toString()).toBe("5");
    expect(discount.reason).toBe("Sem motivo informado");
  });

  it("desconto quase total ainda fecha certo — amountApplied nunca passa do subtotal", async () => {
    // Desconto maior que o subtotal zeraria o total e nenhum pagamento
    // seria aceito (registerPaymentInTx rejeita valor acima do saldo,
    // e `payments` exige ao menos uma linha positiva) — um desconto bem
    // alto, mas abaixo do subtotal, já prova o clamp na prática
    // (clampDecimal, mesma função usada pelo desconto de mesa em
    // apply-discount.ts) sem depender de um cenário de venda grátis que
    // o PDV não precisa suportar.
    const orderIdempotencyKey = `pdv-desconto-alto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaId, quantity: 1 }], // 110
      discount: { value: 109.5, reason: "Desconto quase total, teste de clamp" },
      payments: [
        { paymentMethodId: pixMethodId, amount: 0.5, idempotencyKey: `${orderIdempotencyKey}-pix` },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);

    const session = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: order.serviceSessionId },
    });
    expect(session.discountAmount.toString()).toBe("109.5");
    expect(session.totalAmount.toString()).toBe("0.5");
    expect(session.balanceAmount.toString()).toBe("0");
  });

  it("vende por peso (produto KG) — unitPrice vira o total da pesagem, weightQuantity grava o peso (pedido do usuário, 2026-11-07)", async () => {
    const orderIdempotencyKey = `pdv-peso-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const order = await sellPdv(userId, {
      restaurantId,
      waiterId: userId,
      orderIdempotencyKey,
      items: [{ productId: picanhaKgId, quantity: 1, weightQuantity: 0.35 }], // 59,90/kg × 0,350kg = 20,965 → 20,97 (arredonda)
      payments: [
        { paymentMethodId: pixMethodId, amount: 20.97, idempotencyKey: `${orderIdempotencyKey}-pix` },
      ],
    });
    createdSessionIds.push(order.serviceSessionId);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.quantity).toBe(1);
    expect(item.weightQuantity?.toString()).toBe("0.35");
    expect(item.weightUnitPriceAtOrder?.toString()).toBe("59.9");
    expect(item.unitPrice.toString()).toBe("20.97");

    const session = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: order.serviceSessionId },
    });
    expect(session.totalAmount.toString()).toBe("20.97");
    expect(session.status).toBe("CLOSED");
  });

  it("rejeita peso num produto que não é vendido por quilo", async () => {
    const orderIdempotencyKey = `pdv-peso-invalido-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await expect(
      sellPdv(userId, {
        restaurantId,
        waiterId: userId,
        orderIdempotencyKey,
        items: [{ productId: picanhaId, quantity: 1, weightQuantity: 0.35 }], // picanhaId é "UN"
        payments: [
          { paymentMethodId: pixMethodId, amount: 38.5, idempotencyKey: `${orderIdempotencyKey}-pix` },
        ],
      }),
    ).rejects.toThrow(CreateOrderError);

    const session = await prisma.serviceSession.findFirst({
      where: { orders: { some: { idempotencyKey: orderIdempotencyKey } } },
    });
    if (session) createdSessionIds.push(session.id);
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
