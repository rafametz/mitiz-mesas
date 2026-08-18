import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable } from "@/application/service-session/open-table";
import { createOrder } from "@/application/order/create-order";
import {
  registerPayment,
  RegisterPaymentError,
  voidPayment,
} from "@/application/service-session/register-payment";
import {
  setOrderItemShareParts,
  SetOrderItemShareError,
} from "@/application/service-session/set-order-item-share";
import { buildPayableLines, type PayableOrderItemInput } from "@/domain/payment/item-allocation";

// Teste de integração — pagamento por itens e rateio de consumo (ADR 0006,
// 2026-08-15). Cobre os cenários do enunciado do usuário: unidades
// parciais, item dividido com redistribuição, combinação de tipos numa
// mesma cobrança, estorno, e proteção contra sobre-alocação mesmo pulando
// a validação do cliente (regra 24).
describe("Pagamento por itens e rateio de consumo (ADR 0006)", () => {
  let restaurantId: string;
  let waiterId: string;
  let choppId: string;
  let porcaoId: string;
  let hamburguerId: string;
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
      data: { restaurantId, name: `Categoria alocação ${suffix}` },
    });
    categoryId = category.id;
    const sector = await prisma.productionSector.create({
      data: { restaurantId, name: `Setor alocação ${suffix}` },
    });
    sectorId = sector.id;

    choppId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Chopp Pilsen ${suffix}`,
          price: "12.00",
        },
      })
    ).id;
    porcaoId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Porção Mista ${suffix}`,
          price: "120.00",
        },
      })
    ).id;
    hamburguerId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Hambúrguer ${suffix}`,
          price: "35.00",
        },
      })
    ).id;

    const method = await prisma.paymentMethod.findFirstOrThrow({
      where: { restaurantId, active: true },
    });
    paymentMethodId = method.id;
  });

  afterAll(async () => {
    await prisma.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.payment.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.printJob.deleteMany({
      where: { order: { serviceSession: { tableId: { in: createdTableIds } } } },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: [choppId, porcaoId, hamburguerId] } },
    });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.product.deleteMany({ where: { id: { in: [choppId, porcaoId, hamburguerId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
    await prisma.$disconnect();
  });

  async function openTableWithItems(items: { productId: string; quantity: number }[]) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `ALOC-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 2 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `aloc-${session.id}`,
      items,
    });
    return { session, order };
  }

  it("10 chopes: paga 3, sobram 7 disponíveis; tentar pagar mais que o restante é rejeitado", async () => {
    const { session, order } = await openTableWithItems([{ productId: choppId, quantity: 10 }]);
    const itemId = order.items[0]!.id;

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `chopp-3-${session.id}`,
      allocations: [{ type: "UNITS", orderItemIds: [itemId], quantity: 3 }],
    });
    expect(payment.amount.toString()).toBe("36"); // 3 x 12.00

    const allocation = await prisma.paymentItemAllocation.findFirstOrThrow({
      where: { paymentId: payment.id },
    });
    expect(allocation.kind).toBe("UNITS");
    expect(allocation.quantity).toBe(3);

    // Só restam 7 — pedir 8 é rejeitado mesmo que o cliente tenha
    // calculado errado (regra 24, revalidado contra o banco).
    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        idempotencyKey: `chopp-8-${session.id}`,
        allocations: [{ type: "UNITS", orderItemIds: [itemId], quantity: 8 }],
      }),
    ).rejects.toThrow(RegisterPaymentError);

    // Exatamente as 7 restantes funciona.
    const second = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `chopp-7-${session.id}`,
      allocations: [{ type: "UNITS", orderItemIds: [itemId], quantity: 7 }],
    });
    expect(second.amount.toString()).toBe("84"); // 7 x 12.00

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.balanceAmount.toString()).toBe("0");
  });

  it("agrupa o mesmo item lançado quantity=1 em pedidos diferentes (correção de bug 2026-08-15) e paga através das duas linhas de origem", async () => {
    // Reproduz o relato do usuário: 1 chope lançado agora, mais 1 chope
    // lançado num pedido separado depois — tinha que juntar como "2
    // lançados" na seleção de pagamento, não ficar como duas linhas soltas.
    const table = await prisma.table.create({
      data: { restaurantId, number: `ALOC-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });

    const order1 = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `dup-1-${session.id}`,
      items: [{ productId: choppId, quantity: 1 }],
    });
    const order2 = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `dup-2-${session.id}`,
      items: [{ productId: choppId, quantity: 1 }],
    });

    const items = await prisma.orderItem.findMany({
      where: { order: { serviceSessionId: session.id }, status: { not: "CANCELLED" } },
      include: { modifiers: true, guest: true, allocations: { include: { payment: { select: { voidedAt: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    const payableInput: PayableOrderItemInput[] = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productNameAtOrder: item.productNameAtOrder,
      meatPoint: item.meatPoint,
      guestId: item.guestId,
      guestName: item.guest?.name ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      modifiers: item.modifiers,
      openShareParts: item.openShareParts,
      createdAt: item.createdAt,
      allocations: item.allocations.map((a) => ({
        kind: a.kind,
        quantity: a.quantity,
        amount: a.amount,
        voided: a.payment.voidedAt !== null,
      })),
    }));

    const lines = buildPayableLines(payableInput);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.type).toBe("units");
    if (line.type !== "units") throw new Error("esperado units");
    expect(line.totalQuantity).toBe(2);
    expect(line.sourceItems.map((s) => s.itemId)).toEqual([order1.items[0]!.id, order2.items[0]!.id]);

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `dup-pay-${session.id}`,
      allocations: [{ type: "UNITS", orderItemIds: line.sourceItems.map((s) => s.itemId), quantity: 2 }],
    });
    expect(payment.amount.toString()).toBe("24"); // 2 x 12.00
  });

  it("item dividido em 4 partes, paga 1, redistribui o restante em 2 partes sem alterar o pagamento anterior", async () => {
    const { session, order } = await openTableWithItems([{ productId: porcaoId, quantity: 1 }]);
    const itemId = order.items[0]!.id;

    await setOrderItemShareParts([itemId], waiterId, 4);
    const first = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `porcao-parte1-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "SHARE", parts: 1 }],
    });
    expect(first.amount.toString()).toBe("30"); // 120 / 4

    // Redistribui o saldo aberto (90) em 2 partes de 45 — o pagamento
    // anterior de 30 não pode mudar.
    await setOrderItemShareParts([itemId], waiterId, 2);
    const second = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `porcao-parte2-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "SHARE", parts: 1 }],
    });
    expect(second.amount.toString()).toBe("45"); // 90 / 2

    const firstReloaded = await prisma.payment.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstReloaded.amount.toString()).toBe("30"); // intacto

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.paidAmount.toString()).toBe("75"); // 30 + 45
    expect(current.balanceAmount.toString()).toBe("45"); // 120 - 75
  });

  it("combinação: unidades inteiras + item inteiro + fração de item dividido num único pagamento", async () => {
    const { session, order } = await openTableWithItems([
      { productId: choppId, quantity: 10 },
      { productId: hamburguerId, quantity: 1 },
      { productId: porcaoId, quantity: 1 },
    ]);
    const choppItem = order.items.find((i) => i.productId === choppId)!;
    const hamburguerItem = order.items.find((i) => i.productId === hamburguerId)!;
    const porcaoItem = order.items.find((i) => i.productId === porcaoId)!;

    await setOrderItemShareParts([porcaoItem.id], waiterId, 4);

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `combo-${session.id}`,
      allocations: [
        { type: "UNITS", orderItemIds: [choppItem.id], quantity: 3 },
        { type: "AMOUNT", orderItemIds: [hamburguerItem.id], mode: "FULL" },
        { type: "AMOUNT", orderItemIds: [porcaoItem.id], mode: "SHARE", parts: 1 },
      ],
    });

    // 3x12 (36) + 35 (hambúrguer inteiro) + 30 (1/4 da porção) = 101.
    expect(payment.amount.toString()).toBe("101");
    const allocations = await prisma.paymentItemAllocation.findMany({
      where: { paymentId: payment.id },
    });
    expect(allocations).toHaveLength(3);
  });

  it("valor personalizado é limitado ao saldo aberto do item", async () => {
    const { session, order } = await openTableWithItems([{ productId: hamburguerId, quantity: 1 }]);
    const itemId = order.items[0]!.id;

    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        idempotencyKey: `custom-demais-${session.id}`,
        allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "CUSTOM", amount: 50 }],
      }),
    ).rejects.toThrow(RegisterPaymentError);

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `custom-ok-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "CUSTOM", amount: 20 }],
    });
    expect(payment.amount.toString()).toBe("20");
  });

  it("estorno de pagamento com alocações mistas devolve tudo, sem afetar outro pagamento", async () => {
    const { session, order } = await openTableWithItems([
      { productId: choppId, quantity: 10 },
      { productId: porcaoId, quantity: 1 },
    ]);
    const choppItem = order.items.find((i) => i.productId === choppId)!;
    const porcaoItem = order.items.find((i) => i.productId === porcaoId)!;

    // Pagamento 1 (não deve ser afetado pelo estorno do pagamento 2).
    const untouched = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `estorno-intacto-${session.id}`,
      allocations: [{ type: "UNITS", orderItemIds: [choppItem.id], quantity: 2 }],
    });

    await setOrderItemShareParts([porcaoItem.id], waiterId, 4);
    const mixed = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `estorno-misto-${session.id}`,
      allocations: [
        { type: "UNITS", orderItemIds: [choppItem.id], quantity: 3 },
        { type: "AMOUNT", orderItemIds: [porcaoItem.id], mode: "SHARE", parts: 1 },
      ],
    });

    let current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.paidAmount.toString()).toBe("90"); // 24 (untouched) + 66 (36 + 30, mixed)

    await voidPayment(mixed.id, waiterId, "Cliente desistiu da forma de pagamento");

    current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.paidAmount.toString()).toBe("24"); // só o pagamento 1 continua valendo

    const untouchedReloaded = await prisma.payment.findUniqueOrThrow({ where: { id: untouched.id } });
    expect(untouchedReloaded.voidedAt).toBeNull();

    // As 3 unidades e a fração da porção voltam a estar disponíveis —
    // paga de novo as 8 restantes do chopp (2 já pagas antes + 8 = 10) sem
    // erro de "só há 7 em aberto" (o que aconteceria se o estorno não
    // tivesse devolvido a fatia).
    const again = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `depois-do-estorno-${session.id}`,
      allocations: [{ type: "UNITS", orderItemIds: [choppItem.id], quantity: 8 }],
    });
    expect(again.amount.toString()).toBe("96"); // 8 x 12.00
  });

  it("pagamento livre (sem detalhar itens) continua funcionando sem gravar nenhuma alocação", async () => {
    const { session } = await openTableWithItems([{ productId: hamburguerId, quantity: 1 }]);

    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      amount: "35.00",
      idempotencyKey: `livre-${session.id}`,
    });

    const allocations = await prisma.paymentItemAllocation.findMany({
      where: { paymentId: payment.id },
    });
    expect(allocations).toHaveLength(0);

    const current = await prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(current.balanceAmount.toString()).toBe("0");
  });

  it("dividir vale pra qualquer item, mesmo lançado com mais de 1 unidade (revisão 2026-08-16)", async () => {
    const { session, order } = await openTableWithItems([{ productId: choppId, quantity: 5 }]);
    const itemId = order.items[0]!.id;

    await setOrderItemShareParts([itemId], waiterId, 2);
    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `chopp-dividido-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "SHARE", parts: 1 }],
    });
    expect(payment.amount.toString()).toBe("30"); // 60 (5x12) / 2
  });

  it("divide o saldo somado de duas porções lançadas em pedidos diferentes entre 4 pessoas, atravessando as duas linhas de origem quando a parte pedida passa da primeira", async () => {
    const table = await prisma.table.create({
      data: { restaurantId, number: `ALOC-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 4 });

    const order1 = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `dup-porcao-1-${session.id}`,
      items: [{ productId: porcaoId, quantity: 1 }],
    });
    const order2 = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `dup-porcao-2-${session.id}`,
      items: [{ productId: porcaoId, quantity: 1 }],
    });
    const rowIds = [order1.items[0]!.id, order2.items[0]!.id];

    // Divide as DUAS porções juntas (240 no total) em 4 partes de 60.
    await setOrderItemShareParts(rowIds, waiterId, 4);

    // Pedir 3 partes (180) passa do saldo da primeira linha (120) — 120
    // vêm da primeira, os 60 restantes vêm da segunda.
    const payment = await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `porcoes-3-partes-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: rowIds, mode: "SHARE", parts: 3 }],
    });
    expect(payment.amount.toString()).toBe("180");

    const allocations = await prisma.paymentItemAllocation.findMany({
      where: { paymentId: payment.id },
      orderBy: { amount: "desc" },
    });
    expect(allocations).toHaveLength(2);
    expect(allocations[0]!.amount.toString()).toBe("120");
    expect(allocations[1]!.amount.toString()).toBe("60");
    expect(allocations.every((a) => a.shareNumerator === 3 && a.shareDenominator === 4)).toBe(true);
  });

  it("rejeita dividir item já totalmente pago", async () => {
    const { session, order } = await openTableWithItems([{ productId: hamburguerId, quantity: 1 }]);
    const itemId = order.items[0]!.id;

    await registerPayment(session.id, waiterId, {
      paymentMethodId,
      idempotencyKey: `hamburguer-pago-${session.id}`,
      allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "FULL" }],
    });

    await expect(setOrderItemShareParts([itemId], waiterId, 4)).rejects.toThrow(SetOrderItemShareError);
  });

  it("rejeita pedir mais partes do que as que existem no rateio vigente", async () => {
    const { session, order } = await openTableWithItems([{ productId: porcaoId, quantity: 1 }]);
    const itemId = order.items[0]!.id;
    await setOrderItemShareParts([itemId], waiterId, 3);

    await expect(
      registerPayment(session.id, waiterId, {
        paymentMethodId,
        idempotencyKey: `partes-demais-${session.id}`,
        allocations: [{ type: "AMOUNT", orderItemIds: [itemId], mode: "SHARE", parts: 5 }],
      }),
    ).rejects.toThrow(RegisterPaymentError);
  });
});
