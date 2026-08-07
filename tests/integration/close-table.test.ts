import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import { requestClosing, RequestClosingError } from "@/application/service-session/request-closing";
import {
  applyDiscount,
  ApplyDiscountError,
  voidDiscount,
} from "@/application/service-session/apply-discount";
import { applyServiceCharge } from "@/application/service-session/apply-service-charge";
import {
  registerPayment,
  RegisterPaymentError,
  voidPayment,
} from "@/application/service-session/register-payment";
import { closeTable, CloseTableError } from "@/application/service-session/close-table";

// Teste de integração — precisa de DATABASE_URL/DIRECT_URL reais
// (npm run test:integration). Cobre o fluxo completo do Módulo 8
// (business-rules.md §6): solicitar fechamento → taxa/desconto →
// pagamento(s) → finalizar, incluindo as rejeições do servidor.
describe("Módulo 8 — Caixa e pagamentos", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let paymentMethodId: string;
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria caixa ${suffix}` },
    });
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor caixa ${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        restaurantId,
        categoryId: category.id,
        defaultSectorId: sector.id,
        name: `Produto caixa ${suffix}`,
        price: "100.00",
      },
    });
    productId = product.id;

    const method = await prisma.paymentMethod.findFirstOrThrow({
      where: { restaurantId, active: true },
    });
    paymentMethodId = method.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.discount.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceCharge.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  });

  // Cada teste abre a mesa e lança um pedido de R$100,00 — ponto de
  // partida comum pro fluxo de fechamento.
  async function openTableWithOrder() {
    const table = await prisma.table.create({
      data: { restaurantId, number: `CAIXA-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);

    const session = await openTable({ tableId: table.id, waiterId, guestCount: 2 });
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `caixa-${session.id}`,
      items: [{ productId, quantity: 1 }],
    });

    return prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
  }

  it("fluxo completo: solicitar fechamento, taxa, desconto, dois pagamentos, finalizar", async () => {
    const session = await openTableWithOrder();

    await requestClosing(session.id, waiterId);
    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("WAITING_CLOSING");

    // Taxa de 10% sobre 100 = 10.
    await applyServiceCharge(session.id, waiterId, { percent: 10 });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.serviceChargeAmount.toString()).toBe("10");

    // Desconto fixo de 20.
    await applyDiscount(session.id, waiterId, {
      type: "FIXED_AMOUNT",
      value: "20.00",
      reason: "Cliente fidelidade",
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    // Total = 100 (subtotal) - 20 (desconto) + 10 (taxa) = 90.
    expect(current.discountAmount.toString()).toBe("20");
    expect(current.totalAmount.toString()).toBe("90");
    expect(current.balanceAmount.toString()).toBe("90");

    // Primeiro pagamento parcial — 50.
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "50.00",
      idempotencyKey: `pay-1-${session.id}`,
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("PARTIALLY_PAID");
    expect(current.balanceAmount.toString()).toBe("40");

    // Segundo pagamento (forma diferente) cobre o resto — 40.
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "40.00",
      idempotencyKey: `pay-2-${session.id}`,
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("PAID");
    expect(current.balanceAmount.toString()).toBe("0");

    await closeTable(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSED");
    expect(current.closedAt).not.toBeNull();

    const table = await prisma.table.findUniqueOrThrow({ where: { id: session.tableId } });
    expect(table.status).toBe("FREE");
  });

  it("rejeita solicitar fechamento de mesa que já não está OPEN", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await expect(requestClosing(session.id, waiterId)).rejects.toThrow(RequestClosingError);
  });

  it("rejeita taxa/desconto/pagamento antes de solicitar o fechamento", async () => {
    const session = await openTableWithOrder();

    await expect(
      applyDiscount(session.id, waiterId, { type: "PERCENTAGE", value: 10, reason: "Teste" }),
    ).rejects.toThrow(ApplyDiscountError);
    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        amount: "10.00",
        idempotencyKey: `early-${session.id}`,
      }),
    ).rejects.toThrow(RegisterPaymentError);
  });

  it("rejeita pagamento maior que o saldo restante", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        amount: "999.00",
        idempotencyKey: `too-much-${session.id}`,
      }),
    ).rejects.toThrow(RegisterPaymentError);
  });

  it("rejeita finalizar com saldo diferente de zero (regra 11)", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await expect(closeTable(session.id, waiterId)).rejects.toThrow(CloseTableError);
  });

  it("pagamento é idempotente — chave repetida não duplica nem soma duas vezes", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);
    const idempotencyKey = `dup-${session.id}`;

    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey,
    });
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey,
    });

    const payments = await prisma.payment.findMany({ where: { serviceSessionId: session.id } });
    expect(payments).toHaveLength(1);

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("PAID");
  });

  it("estornar pagamento (nunca apaga) restaura o saldo e volta pra PARTIALLY_PAID", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);
    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey: `void-me-${session.id}`,
    });

    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("PAID");

    await voidPayment(payment.id, waiterId, "Pagamento em duplicidade");

    const voided = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(voided.voidedAt).not.toBeNull(); // nunca apagado, só marcado

    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("PARTIALLY_PAID");
    expect(current.balanceAmount.toString()).toBe("100");
  });

  it("só permite um desconto ativo por vez — precisa anular antes de aplicar outro", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await applyDiscount(session.id, waiterId, {
      type: "PERCENTAGE",
      value: 10,
      reason: "Primeiro",
    });

    await expect(
      applyDiscount(session.id, waiterId, { type: "PERCENTAGE", value: 5, reason: "Segundo" }),
    ).rejects.toThrow(ApplyDiscountError);

    const active = await prisma.discount.findFirstOrThrow({
      where: { serviceSessionId: session.id, voidedAt: null },
    });
    await voidDiscount(active.id, waiterId, "Trocar por outro");

    // Depois de anulado, aplica normalmente.
    await applyDiscount(session.id, waiterId, { type: "PERCENTAGE", value: 5, reason: "Segundo" });
    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.discountAmount.toString()).toBe("5");
  });

  it("desconto nunca passa do subtotal, mesmo pedindo mais que 100%", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await applyDiscount(session.id, waiterId, {
      type: "PERCENTAGE",
      value: 150,
      reason: "Erro de digitação",
    });

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.discountAmount.toString()).toBe("100"); // clampado no subtotal
    expect(current.totalAmount.toString()).toBe("0");
    expect(current.balanceAmount.toString()).toBe("0");
  });
});
