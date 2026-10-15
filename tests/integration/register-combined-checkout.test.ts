import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import { voidPayment } from "@/application/service-session/register-payment";
import {
  CombinedCheckoutError,
  registerCombinedCheckout,
} from "@/application/service-session/register-combined-checkout";

// Teste de integração — Pagamento Combinado (ADR 0010, 2026-10-15): cobre
// o exemplo completo do pedido original (mesa com consumo selecionado +
// produto de loja, formas de pagamento manuais por origem, numa
// confirmação só), idempotência do conjunto e estorno independente por
// origem.
describe("registerCombinedCheckout (ADR 0010)", () => {
  let restaurantId: string;
  let userId: string;
  let choppId: string;
  let hamburguerId: string;
  let picanhaId: string;
  let pixMethodId: string;
  let dinheiroMethodId: string;
  const createdTableIds: string[] = [];
  const createdPdvSessionIds: string[] = [];
  const createdCombinedCheckoutIds: string[] = [];
  let categoryId: string;
  let sectorId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    userId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria combinado ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor combinado ${suffix}` },
    });
    sectorId = sector.id;

    choppId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Chopp Pilsen combinado ${suffix}`,
          price: "12.00",
        },
      })
    ).id;
    hamburguerId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Hambúrguer combinado ${suffix}`,
          price: "35.00",
        },
      })
    ).id;
    picanhaId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Picanha loja combinado ${suffix}`,
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
    const allSessionIds = [
      ...createdPdvSessionIds,
      ...(
        await prisma.serviceSession.findMany({
          where: { tableId: { in: createdTableIds } },
          select: { id: true },
        })
      ).map((s) => s.id),
    ];
    await prisma.combinedCheckout.deleteMany({ where: { id: { in: createdCombinedCheckoutIds } } });
    await prisma.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSessionId: { in: allSessionIds } } },
    });
    await prisma.payment.deleteMany({ where: { serviceSessionId: { in: allSessionIds } } });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSessionId: { in: allSessionIds } } },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: [choppId, hamburguerId, picanhaId] } },
    });
    await prisma.order.deleteMany({ where: { serviceSessionId: { in: allSessionIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: allSessionIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [choppId, hamburguerId, picanhaId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  async function openTableWithItems(items: { productId: string; quantity: number }[]) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `COMB-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId: userId, guestCount: 2 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId: userId,
      idempotencyKey: `comb-${session.id}`,
      items,
    });
    return { session, order };
  }

  it("cobre mesa (seleção de consumo) + loja (picanha) numa confirmação só, com forma de pagamento manual por origem", async () => {
    const { session, order } = await openTableWithItems([
      { productId: choppId, quantity: 3 },
      { productId: hamburguerId, quantity: 1 },
    ]);
    const choppItem = order.items.find((i) => i.productId === choppId)!;
    const hamburguerItem = order.items.find((i) => i.productId === hamburguerId)!;

    const idempotencyKey = `combinado-${session.id}`;
    const combinedCheckout = await registerCombinedCheckout({
      idempotencyKey,
      registeredById: userId,
      table: {
        serviceSessionId: session.id,
        payments: [
          {
            paymentMethodId: pixMethodId,
            idempotencyKey: `combinado-mesa-${session.id}`,
            allocations: [
              { type: "UNITS", orderItemIds: [choppItem.id], quantity: 3 },
              { type: "AMOUNT", orderItemIds: [hamburguerItem.id], mode: "FULL" },
            ],
          },
        ],
      },
      pdv: {
        restaurantId,
        waiterId: userId,
        orderIdempotencyKey: `combinado-pdv-pedido-${session.id}`,
        items: [{ productId: picanhaId, quantity: 1 }],
        payments: [
          {
            paymentMethodId: pixMethodId,
            amount: 44,
            idempotencyKey: `combinado-pdv-pix-${session.id}`,
          },
          {
            paymentMethodId: dinheiroMethodId,
            amount: 66,
            idempotencyKey: `combinado-pdv-dinheiro-${session.id}`,
          },
        ],
      },
    });

    createdCombinedCheckoutIds.push(combinedCheckout.id);

    const payments = await prisma.payment.findMany({
      where: { combinedCheckoutId: combinedCheckout.id },
      orderBy: { amount: "desc" },
    });
    // Mesa: 3x12 + 35 = 71. Loja: 44 + 66 = 110. Três Payment, nunca um só
    // cobrindo as duas origens (seção 7 da ADR).
    expect(payments).toHaveLength(3);
    expect(payments.map((p) => p.amount.toString()).sort()).toEqual(["44", "66", "71"].sort());
    createdPdvSessionIds.push(
      ...new Set(
        payments.filter((p) => p.serviceSessionId !== session.id).map((p) => p.serviceSessionId),
      ),
    );

    // Mesa continua OPEN, saldo reduzido pelo que foi pago agora — nunca
    // fecha por conta do checkout combinado (seção 9 da ADR).
    const tableSession = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(tableSession.status).toBe("OPEN");
    expect(tableSession.balanceAmount.toString()).toBe("0");

    // Sessão do PDV fecha sozinha ao zerar o saldo (decisão do usuário).
    const pdvSessionId = payments.find((p) => p.serviceSessionId !== session.id)!.serviceSessionId;
    const pdvSession = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: pdvSessionId },
    });
    expect(pdvSession.status).toBe("CLOSED");
    expect(pdvSession.type).toBe("PDV");
    expect(pdvSession.balanceAmount.toString()).toBe("0");
    expect(pdvSession.totalAmount.toString()).toBe("110");

    // Repetir a mesma chave (duplo toque em "Confirmar") devolve a mesma
    // operação, sem criar uma segunda sessão de PDV nem duplicar Payment
    // (seção 8 da ADR).
    const retry = await registerCombinedCheckout({
      idempotencyKey,
      registeredById: userId,
      table: {
        serviceSessionId: session.id,
        payments: [
          {
            paymentMethodId: pixMethodId,
            idempotencyKey: `combinado-mesa-${session.id}`,
            allocations: [{ type: "UNITS", orderItemIds: [choppItem.id], quantity: 3 }],
          },
        ],
      },
      pdv: {
        restaurantId,
        waiterId: userId,
        orderIdempotencyKey: `combinado-pdv-pedido-retry-${session.id}`,
        items: [{ productId: picanhaId, quantity: 1 }],
        payments: [
          { paymentMethodId: pixMethodId, amount: 110, idempotencyKey: `retry-${session.id}` },
        ],
      },
    });
    expect(retry.id).toBe(combinedCheckout.id);
    const paymentsAfterRetry = await prisma.payment.count({
      where: { combinedCheckoutId: combinedCheckout.id },
    });
    expect(paymentsAfterRetry).toBe(3);

    // Estornar o pagamento da loja não afeta o pagamento da mesa, e
    // vice-versa (seção 10 da ADR) — cada Payment é independente.
    const pdvPayment = payments.find((p) => p.serviceSessionId !== session.id)!;
    await voidPayment(pdvPayment.id, userId, "Cliente desistiu da picanha");

    const tableAfterVoid = await prisma.serviceSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(tableAfterVoid.balanceAmount.toString()).toBe("0");
    const mesaPaymentReloaded = payments.find((p) => p.serviceSessionId === session.id)!;
    const mesaReloaded = await prisma.payment.findUniqueOrThrow({
      where: { id: mesaPaymentReloaded.id },
    });
    expect(mesaReloaded.voidedAt).toBeNull();
  });

  it("rejeita pagamento da mesa sem seleção de itens (allocations) dentro do checkout combinado", async () => {
    const { session, order } = await openTableWithItems([{ productId: hamburguerId, quantity: 1 }]);
    void order;

    await expect(
      registerCombinedCheckout({
        idempotencyKey: `combinado-invalido-${session.id}`,
        registeredById: userId,
        table: {
          serviceSessionId: session.id,
          payments: [
            {
              paymentMethodId: pixMethodId,
              amount: 35,
              idempotencyKey: `combinado-mesa-invalido-${session.id}`,
            },
          ],
        },
        pdv: {
          restaurantId,
          waiterId: userId,
          orderIdempotencyKey: `combinado-pdv-invalido-${session.id}`,
          items: [{ productId: picanhaId, quantity: 1 }],
          payments: [
            {
              paymentMethodId: pixMethodId,
              amount: 110,
              idempotencyKey: `combinado-pdv-pix-invalido-${session.id}`,
            },
          ],
        },
      }),
    ).rejects.toThrow(CombinedCheckoutError);
  });
});
