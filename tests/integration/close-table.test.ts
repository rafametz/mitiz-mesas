import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import { requestClosing, RequestClosingError } from "@/application/service-session/request-closing";
import {
  cancelClosingRequest,
  CancelClosingRequestError,
} from "@/application/service-session/cancel-closing-request";
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
import { markGuestSettled, reopenGuest } from "@/application/guest/mark-guest-settled";

// Teste de integração — precisa de DATABASE_URL/DIRECT_URL reais
// (npm run test:integration). Cobre o Módulo 8 revisado
// (docs/product/business-rules.md §6, revisão 2026-08-10 — separação
// PAGAMENTO/FECHAMENTO): pagamento é permitido a qualquer momento do
// atendimento ativo (OPEN ou CLOSING) e nunca bloqueia pedido novo
// sozinho; só CLOSING (fechamento solicitado explicitamente) bloqueia.
describe("Módulo 8 — Caixa e pagamentos (pagamento separado de fechamento)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let paymentMethodId: string;
  const createdTableIds: string[] = [];
  let categoryId: string;
  let sectorId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const category = await prisma.category.create({
      data: { restaurantId, name: `Categoria caixa ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor caixa ${suffix}` },
    });
    sectorId = sector.id;
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

  async function openTableWithOrder(guestCount = 2) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `CAIXA-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);

    const session = await openTable({ tableId: table.id, waiterId, guestCount });
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `caixa-${session.id}`,
      items: [{ productId, quantity: 1 }],
    });

    return prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
  }

  // Reproduz o exemplo do enunciado: mesa de 4 pessoas, consumo 400, uma
  // pessoa paga 100 e vai embora, a mesa continua OPEN e aceita mais
  // pedido, saldo recalculado dinamicamente.
  it("pagamento parcial em OPEN não bloqueia pedido novo e o saldo é recalculado dinamicamente", async () => {
    const table = await prisma.table.create({
      data: { restaurantId, number: `CAIXA-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);

    const session = await openTable({ tableId: table.id, waiterId, guestCount: 4 });

    // Consumo = 400 (4x produto de 100).
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `enunciado-1-${session.id}`,
      items: [{ productId, quantity: 4 }],
    });
    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.totalAmount.toString()).toBe("400");

    // Uma pessoa paga 100 e vai embora — sem solicitar fechamento.
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey: `enunciado-pay-${session.id}`,
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN"); // continua OPEN — não vira "fechando".
    expect(current.paidAmount.toString()).toBe("100");
    expect(current.balanceAmount.toString()).toBe("300");

    // As outras continuam pedindo — isto é o que o bug antigo bloqueava.
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `enunciado-2-${session.id}`,
      items: [{ productId, quantity: 1, notes: "mais consumo depois do pagamento parcial" }],
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.totalAmount.toString()).toBe("500");
    expect(current.paidAmount.toString()).toBe("100");
    expect(current.balanceAmount.toString()).toBe("400");
  });

  it("saldo chegando a zero em OPEN não fecha nada nem impede pedido novo", async () => {
    const session = await openTableWithOrder(1); // consumo = 100

    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey: `zera-${session.id}`,
    });
    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.balanceAmount.toString()).toBe("0");

    // Mesmo com saldo zero, a mesa não fechou sozinha — continua aceitando
    // pedido novo, saldo volta a subir.
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `zera-2-${session.id}`,
      items: [{ productId, quantity: 1 }],
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.balanceAmount.toString()).toBe("100");
  });

  it("closeTable rejeita mesmo com saldo zero se o fechamento não foi solicitado (status != CLOSING)", async () => {
    const session = await openTableWithOrder(1);
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey: `sem-closing-${session.id}`,
    });
    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.balanceAmount.toString()).toBe("0");

    await expect(closeTable(session.id, waiterId)).rejects.toThrow(CloseTableError);
  });

  it("fluxo completo: pagamento antes de solicitar, fechamento pedido depois, taxa, desconto, finalizar", async () => {
    const session = await openTableWithOrder(); // consumo = 100

    // Pagamento parcial ANTES de solicitar fechamento — o novo caminho
    // principal (revisão 2026-08-10).
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "30.00",
      idempotencyKey: `fluxo-pre-${session.id}`,
    });
    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.balanceAmount.toString()).toBe("70");

    await requestClosing(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSING");

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
    // Total = 100 (subtotal) - 20 (desconto) + 10 (taxa) = 90. Pago 30 -> saldo 60.
    expect(current.discountAmount.toString()).toBe("20");
    expect(current.totalAmount.toString()).toBe("90");
    expect(current.balanceAmount.toString()).toBe("60");

    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "60.00",
      idempotencyKey: `fluxo-final-${session.id}`,
    });
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSING"); // pagamento nunca muda o status sozinho.
    expect(current.balanceAmount.toString()).toBe("0");

    await closeTable(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSED");
    expect(current.closedAt).not.toBeNull();

    const table = await prisma.table.findUniqueOrThrow({ where: { id: session.tableId! } });
    expect(table.status).toBe("FREE");
  });

  it("rejeita solicitar fechamento de mesa que já não está OPEN", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);

    await expect(requestClosing(session.id, waiterId)).rejects.toThrow(RequestClosingError);
  });

  it("cancelClosingRequest volta CLOSING -> OPEN e a mesa aceita pedido de novo", async () => {
    const session = await openTableWithOrder();
    await requestClosing(session.id, waiterId);
    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("CLOSING");

    await cancelClosingRequest(session.id, waiterId);
    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");

    // Aceita pedido de novo, prova de que voltou a ficar OPEN de verdade.
    await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `pos-cancel-${session.id}`,
      items: [{ productId, quantity: 1 }],
    });

    const table = await prisma.table.findUniqueOrThrow({ where: { id: session.tableId! } });
    expect(table.status).toBe("OCCUPIED");
  });

  it("rejeita cancelar solicitação de fechamento quando não está em CLOSING", async () => {
    const session = await openTableWithOrder();
    await expect(cancelClosingRequest(session.id, waiterId)).rejects.toThrow(
      CancelClosingRequestError,
    );
  });

  it("rejeita taxa/desconto antes de solicitar o fechamento (continuam exigindo CLOSING)", async () => {
    const session = await openTableWithOrder();

    await expect(
      applyDiscount(session.id, waiterId, { type: "PERCENTAGE", value: 10, reason: "Teste" }),
    ).rejects.toThrow(ApplyDiscountError);
  });

  it("pagamento é permitido em OPEN sem fechamento solicitado (revisão 2026-08-10)", async () => {
    const session = await openTableWithOrder();
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "10.00",
      idempotencyKey: `open-payment-${session.id}`,
    });
    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.paidAmount.toString()).toBe("10");
  });

  it("rejeita pagamento maior que o saldo restante", async () => {
    const session = await openTableWithOrder();

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
    expect(current.balanceAmount.toString()).toBe("0");
  });

  it("estornar pagamento (nunca apaga) restaura o saldo, sem mudar o status", async () => {
    const session = await openTableWithOrder();
    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "100.00",
      idempotencyKey: `void-me-${session.id}`,
    });

    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN");
    expect(current.balanceAmount.toString()).toBe("0");

    await voidPayment(payment.id, waiterId, "Pagamento em duplicidade");

    const voided = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(voided.voidedAt).not.toBeNull(); // nunca apagado, só marcado

    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.status).toBe("OPEN"); // estorno também não mexe em status.
    expect(current.balanceAmount.toString()).toBe("100");
  });

  it("pagamento vinculado a uma pessoa (guestId) — pagamento geral continua funcionando também", async () => {
    const session = await openTableWithOrder();
    const guest = await prisma.guest.create({
      data: { serviceSessionId: session.id, name: "Ana", sortOrder: 0 },
    });

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "40.00",
      idempotencyKey: `guest-pay-${session.id}`,
      guestId: guest.id,
    });
    expect(payment.guestId).toBe(guest.id);

    // Pagamento geral (sem guestId) continua funcionando na mesma comanda.
    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "10.00",
      idempotencyKey: `general-pay-${session.id}`,
    });

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.paidAmount.toString()).toBe("50");
  });

  it("rejeita pagamento vinculado a pessoa que não pertence à mesa", async () => {
    const session = await openTableWithOrder();
    const otherSession = await openTableWithOrder();
    const guestFromOtherTable = await prisma.guest.create({
      data: { serviceSessionId: otherSession.id, name: "Intruso", sortOrder: 0 },
    });

    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        amount: "10.00",
        idempotencyKey: `intruso-${session.id}`,
        guestId: guestFromOtherTable.id,
      }),
    ).rejects.toThrow(RegisterPaymentError);
  });

  it("marcar/reabrir pessoa (SETTLED/ACTIVE) é manual e não mexe em pagamento nem status da mesa", async () => {
    const session = await openTableWithOrder();
    const guest = await prisma.guest.create({
      data: { serviceSessionId: session.id, name: "Beto", sortOrder: 0 },
    });

    await markGuestSettled(guest.id, waiterId);
    let current = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(current.status).toBe("SETTLED");

    await reopenGuest(guest.id, waiterId);
    current = await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } });
    expect(current.status).toBe("ACTIVE");

    const session2 = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(session2.status).toBe("OPEN");
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
