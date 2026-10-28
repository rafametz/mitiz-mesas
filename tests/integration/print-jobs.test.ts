import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/application/order/create-order";
import { openTable } from "@/application/service-session/open-table";
import { authorizeCancelOrderItem } from "@/application/order/cancel-order-item";
import { registerPayment } from "@/application/service-session/register-payment";
import {
  claimPendingPrintJobs,
  createReprintJob,
  findPrinterByToken,
  markPrintJobFailed,
  markPrintJobPrinted,
  PrintJobError,
  reprocessPrintJob,
} from "@/application/printing/print-queue";
import { createBillSummaryPrintJob } from "@/application/printing/create-bill-summary-print-job";
import { createPdvSaleReceiptPrintJob } from "@/application/printing/create-pdv-sale-receipt-print-job";
import { sellPdv } from "@/application/service-session/sell-pdv";
import { registerCombinedCheckout } from "@/application/service-session/register-combined-checkout";
import { generatePrinterToken, hashPrinterToken } from "@/lib/printing/token";
import { formatBRL, toDecimal } from "@/lib/money";

describe("PrintJob (Módulo 7 — impressão)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let categoryId: string;
  let sectorId: string;
  let printerId: string;
  let printerToken: string;
  let paymentMethodId: string;
  // Setor com impressão desligada (hasPrinting: false) — pedido do
  // usuário 2026-08-13: desmarcar "gerar impressão" pro Bar continuava
  // imprimindo ticket normalmente, porque esse campo só era checado na
  // tela de Setores, nunca na hora de criar o PrintJob de verdade.
  let noPrintSectorId: string;
  let noPrintProductId: string;
  const createdTableIds: string[] = [];
  // Recibo de venda do PDV (PDV_SALE) não tem mesa — rastreado à parte
  // pra limpeza, mesmo racional de tests/integration/sell-pdv.test.ts.
  const createdPdvSessionIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    categoryId = (
      await prisma.category.create({ data: { restaurantId, name: `Cat print ${suffix}` } })
    ).id;
    sectorId = (
      await prisma.productionSector.create({
        data: { restaurantId, name: `Setor print ${suffix}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: sectorId,
          name: `Produto print ${suffix}`,
          price: "40.00",
        },
      })
    ).id;

    printerToken = generatePrinterToken();
    printerId = (
      await prisma.printer.create({
        data: {
          restaurantId,
          name: `Impressora print ${suffix}`,
          agentTokenHash: hashPrinterToken(printerToken),
        },
      })
    ).id;
    paymentMethodId = (
      await prisma.paymentMethod.create({
        data: { restaurantId, name: `Forma print ${suffix}` },
      })
    ).id;

    noPrintSectorId = (
      await prisma.productionSector.create({
        data: { restaurantId, name: `Setor sem impressão ${suffix}`, hasPrinting: false },
      })
    ).id;
    noPrintProductId = (
      await prisma.product.create({
        data: {
          restaurantId,
          categoryId,
          defaultSectorId: noPrintSectorId,
          name: `Produto sem impressão ${suffix}`,
          price: "12.00",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.printJob.deleteMany({
      where: {
        OR: [
          { sectorId },
          { sectorId: noPrintSectorId },
          { serviceSession: { tableId: { in: createdTableIds } } },
          { serviceSessionId: { in: createdPdvSessionIds } },
        ],
      },
    });
    await prisma.paymentItemAllocation.deleteMany({
      where: {
        payment: {
          OR: [{ paymentMethodId }, { serviceSessionId: { in: createdPdvSessionIds } }],
        },
      },
    });
    await prisma.payment.deleteMany({
      where: { OR: [{ paymentMethodId }, { serviceSessionId: { in: createdPdvSessionIds } }] },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: [productId, noPrintProductId] } },
    });
    await prisma.order.deleteMany({
      where: {
        OR: [
          { serviceSession: { tableId: { in: createdTableIds } } },
          { serviceSessionId: { in: createdPdvSessionIds } },
        ],
      },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.serviceSession.deleteMany({ where: { id: { in: createdPdvSessionIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.printer.deleteMany({ where: { id: printerId } });
    await prisma.paymentMethod.deleteMany({ where: { id: paymentMethodId } });
    await prisma.product.deleteMany({ where: { id: { in: [productId, noPrintProductId] } } });
    await prisma.productionSector.deleteMany({
      where: { id: { in: [sectorId, noPrintSectorId] } },
    });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  async function openTableWithOrder(quantity = 1) {
    const table = await prisma.table.create({
      data: { restaurantId, number: `PRINT-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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

  it("cria um PrintJob NEW_ORDER ao enviar o primeiro pedido da mesa", async () => {
    const { order } = await openTableWithOrder();

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.type).toBe("NEW_ORDER");
    expect(jobs[0]?.status).toBe("PENDING");
    expect(jobs[0]?.sectorId).toBe(sectorId);
    expect(jobs[0]?.printerId).toBe(printerId);

    const content = jobs[0]?.contentSnapshot as Record<string, unknown>;
    expect(content.tableNumber).toBeTruthy();
    expect(content.items).toHaveLength(1);
    // Mesa aberta sem responsável (openTableWithOrder não informa) — vira
    // null, não some do conteúdo (pedido do usuário 2026-08-14).
    expect(content.responsibleName).toBeNull();
  });

  it("responsável da mesa aparece no cabeçalho do ticket quando preenchido", async () => {
    const table = await prisma.table.create({
      data: {
        restaurantId,
        number: `PRINT-RESP-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    createdTableIds.push(table.id);
    const session = await openTable({
      tableId: table.id,
      waiterId,
      guestCount: 1,
      responsibleName: "Rafael",
    });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-resp-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });

    const job = await prisma.printJob.findFirstOrThrow({ where: { orderId: order.id } });
    const content = job.contentSnapshot as Record<string, unknown>;
    expect(content.responsibleName).toBe("Rafael");

    // Cancelamento do mesmo item também carrega o responsável no ticket.
    await authorizeCancelOrderItem(order.items[0]!.id, waiterId, "Teste responsável");
    const cancellationJob = await prisma.printJob.findFirstOrThrow({
      where: { orderId: order.id, type: "CANCELLATION" },
    });
    const cancellationContent = cancellationJob.contentSnapshot as Record<string, unknown>;
    expect(cancellationContent.responsibleName).toBe("Rafael");
  });

  it("segundo pedido da mesma mesa cria PrintJob do tipo COMPLEMENT", async () => {
    const { session } = await openTableWithOrder();

    const secondOrder = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-2-${Date.now()}-${Math.random()}`,
      items: [{ productId, quantity: 1 }],
    });

    const jobs = await prisma.printJob.findMany({ where: { orderId: secondOrder.id } });
    expect(jobs[0]?.type).toBe("COMPLEMENT");
  });

  it("cancelar item de fato cria um PrintJob CANCELLATION com o motivo", async () => {
    const { item } = await openTableWithOrder();

    await authorizeCancelOrderItem(item.id, waiterId, "Cliente desistiu do prato");

    const cancellationJob = await prisma.printJob.findFirst({
      where: { orderId: item.orderId, type: "CANCELLATION" },
    });
    expect(cancellationJob).not.toBeNull();
    const content = cancellationJob?.contentSnapshot as Record<string, unknown>;
    expect(content.cancelReason).toBe("Cliente desistiu do prato");
  });

  it("setor com hasPrinting: false não gera PrintJob ao enviar pedido", async () => {
    const table = await prisma.table.create({
      data: {
        restaurantId,
        number: `PRINT-NOPRINT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-noprint-${Date.now()}-${Math.random()}`,
      items: [{ productId: noPrintProductId, quantity: 1 }],
    });

    const jobs = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(jobs).toHaveLength(0);
  });

  it("setor com hasPrinting: false não gera PrintJob CANCELLATION ao cancelar item", async () => {
    const table = await prisma.table.create({
      data: {
        restaurantId,
        number: `PRINT-NOPRINT-CANC-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    createdTableIds.push(table.id);
    const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
    const order = await createOrder({
      serviceSessionId: session.id,
      waiterId,
      idempotencyKey: `key-noprint-cancel-${Date.now()}-${Math.random()}`,
      items: [{ productId: noPrintProductId, quantity: 1 }],
    });

    await authorizeCancelOrderItem(order.items[0]!.id, waiterId, "Teste setor sem impressão");

    const cancellationJob = await prisma.printJob.findFirst({
      where: { orderId: order.id, type: "CANCELLATION" },
    });
    expect(cancellationJob).toBeNull();
  });

  it("findPrinterByToken autentica com o token certo e rejeita token errado", async () => {
    const found = await findPrinterByToken(printerToken);
    expect(found?.id).toBe(printerId);

    const notFound = await findPrinterByToken("token-invalido");
    expect(notFound).toBeNull();
  });

  it("claim marca PENDING -> PROCESSING e devolve o conteúdo já validado", async () => {
    const { order } = await openTableWithOrder();
    const [job] = await prisma.printJob.findMany({ where: { orderId: order.id } });

    // O claim pega tudo que está PENDING pra essa impressora (podem ser
    // vários — outros testes deste arquivo também criam job pra ela); o
    // que importa é que O NOSSO job específico tenha sido reivindicado.
    const claimed = await claimPendingPrintJobs(printerId, 50);
    const claimedOurs = claimed.find((j) => j.id === job!.id);
    expect(claimedOurs).toBeTruthy();
    const content = claimedOurs?.content;
    if (
      content?.type === "BILL_SUMMARY" ||
      content?.type === "ROAST_RESERVATION" ||
      content?.type === "PDV_SALE"
    ) {
      throw new Error("Esperado um ticket de pedido, não um resumo/reserva/recibo.");
    }
    expect(content?.tableNumber).toBeTruthy();

    const reloaded = await prisma.printJob.findUniqueOrThrow({ where: { id: job!.id } });
    expect(reloaded.status).toBe("PROCESSING");
  });

  it("falha de impressão fica disponível para reprocessamento (não duplica)", async () => {
    const { order } = await openTableWithOrder();
    const [job] = await prisma.printJob.findMany({ where: { orderId: order.id } });

    await claimPendingPrintJobs(printerId, 50); // marca PROCESSING
    const failed = await markPrintJobFailed(printerId, job!.id, "Impressora sem papel");
    expect(failed.status).toBe("FAILED");
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe("Impressora sem papel");

    const reprocessed = await reprocessPrintJob(job!.id);
    expect(reprocessed.status).toBe("PENDING");
    expect(reprocessed.attempts).toBe(1); // histórico de tentativas não zera

    // Ainda é o mesmo job (mesmo id) — reprocessar não duplica.
    const allJobsForOrder = await prisma.printJob.findMany({ where: { orderId: order.id } });
    expect(allJobsForOrder).toHaveLength(1);
  });

  it("marca sucesso de impressão com printedAt preenchido", async () => {
    const { order } = await openTableWithOrder();
    const [job] = await prisma.printJob.findMany({ where: { orderId: order.id } });

    await claimPendingPrintJobs(printerId, 50);
    const printed = await markPrintJobPrinted(printerId, job!.id);
    expect(printed.status).toBe("PRINTED");
    expect(printed.printedAt).not.toBeNull();
  });

  it("reimpressão cria um PrintJob novo (REPRINT), preservando o job original", async () => {
    const { order } = await openTableWithOrder();
    const [original] = await prisma.printJob.findMany({ where: { orderId: order.id } });

    await claimPendingPrintJobs(printerId, 50);
    await markPrintJobPrinted(printerId, original!.id);

    const reprint = await createReprintJob(original!.id);
    expect(reprint.type).toBe("REPRINT");
    expect(reprint.orderId).toBe(original!.orderId);
    expect(reprint.sectorId).toBe(original!.sectorId);
    expect(reprint.id).not.toBe(original!.id);

    const stillThere = await prisma.printJob.findUnique({ where: { id: original!.id } });
    expect(stillThere?.status).toBe("PRINTED"); // original não foi alterado
  });

  describe("Imprimir conferência (BILL_SUMMARY)", () => {
    it("gera o resumo com itens consolidados, total e divisão por pessoa", async () => {
      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: `PRINT-BILL-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
      createdTableIds.push(table.id);
      const session = await openTable({ tableId: table.id, waiterId, guestCount: 3 });
      await createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-bill-1-${Date.now()}-${Math.random()}`,
        items: [{ productId, quantity: 2 }], // 2x R$40,00 = R$80,00
      });

      const { job, printerConfigured } = await createBillSummaryPrintJob(session.id);

      expect(job.type).toBe("BILL_SUMMARY");
      expect(job.orderId).toBeNull();
      expect(job.sectorId).toBeNull();
      expect(job.serviceSessionId).toBe(session.id);
      expect(job.printerId).toBe(printerId);
      expect(printerConfigured).toBe(true);

      const content = job.contentSnapshot as Record<string, unknown>;
      expect(content.type).toBe("BILL_SUMMARY");
      expect(content.guestCount).toBe(3);
      expect(content.items).toHaveLength(1);
      expect((content.items as { quantity: number }[])[0]?.quantity).toBe(2);
      expect((content.items as { unitPrice: string }[])[0]?.unitPrice).toBe(formatBRL("40.00"));
      expect(content.total).toBe(formatBRL("80.00"));
      // Valor de referência "total / pessoas" (não é mais uma lista de
      // partes, pedido do usuário 2026-08-13) — 80 / 3 = 26,666... -> 26,67.
      expect(content.perPersonShare).toBe(formatBRL(toDecimal("80.00").div(3).toDecimalPlaces(2)));
      expect(content.payments).toEqual([]);
      expect(content.balance).toBe(formatBRL("80.00"));
    });

    it("inclui pagamentos já registrados e o saldo restante", async () => {
      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: `PRINT-BILL-PAY-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
      createdTableIds.push(table.id);
      const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
      await createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-bill-2-${Date.now()}-${Math.random()}`,
        items: [{ productId, quantity: 1 }], // R$40,00
      });
      await registerPayment(session.id, waiterId, {
        paymentMethodId,
        amount: "15.00",
        idempotencyKey: `pay-bill-${Date.now()}-${Math.random()}`,
      });

      const { job } = await createBillSummaryPrintJob(session.id);
      const content = job.contentSnapshot as Record<string, unknown>;

      expect(content.paidAmount).toBe(formatBRL("15.00"));
      expect(content.balance).toBe(formatBRL("25.00"));
      expect(content.payments).toHaveLength(1);
      expect((content.payments as { amount: string }[])[0]?.amount).toBe(formatBRL("15.00"));
    });

    it("não é reimprimível — createReprintJob rejeita com mensagem clara", async () => {
      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: `PRINT-BILL-RE-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
      createdTableIds.push(table.id);
      const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
      await createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-bill-3-${Date.now()}-${Math.random()}`,
        items: [{ productId, quantity: 1 }],
      });
      const { job } = await createBillSummaryPrintJob(session.id);

      await expect(createReprintJob(job.id)).rejects.toThrow(PrintJobError);
    });

    it("claim busca o conteúdo do resumo sem erro de validação", async () => {
      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: `PRINT-BILL-CLAIM-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
      createdTableIds.push(table.id);
      const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
      await createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-bill-4-${Date.now()}-${Math.random()}`,
        items: [{ productId, quantity: 1 }],
      });
      const { job } = await createBillSummaryPrintJob(session.id);

      const claimed = await claimPendingPrintJobs(printerId, 50);
      const ours = claimed.find((j) => j.id === job.id);
      expect(ours).toBeTruthy();
      expect(ours?.type).toBe("BILL_SUMMARY");
      expect((ours?.content as { total: string }).total).toBeTruthy();
    });
  });

  describe("Recibo de venda do PDV (PDV_SALE) — Módulo 17", () => {
    it("venda pura: uma origem (Loja), troco calculado a partir do valor recebido informado", async () => {
      const orderIdempotencyKey = `key-pdv-print-1-${Date.now()}-${Math.random()}`;
      const order = await sellPdv(waiterId, {
        restaurantId,
        waiterId,
        orderIdempotencyKey,
        items: [{ productId, quantity: 1 }], // R$40,00
        payments: [{ paymentMethodId, amount: 40, idempotencyKey: `${orderIdempotencyKey}-pay` }],
      });
      createdPdvSessionIds.push(order.serviceSessionId);

      // "Recebido em dinheiro" é só informação de impressão (nunca
      // influencia o valor gravado em Payment) — repassado aqui como o
      // operador teria digitado na tela (visão da Fase 2, troco).
      const { job, printerConfigured } = await createPdvSaleReceiptPrintJob(
        order.serviceSessionId,
        {
          [`${orderIdempotencyKey}-pay`]: "50",
        },
      );

      expect(job.type).toBe("PDV_SALE");
      expect(job.orderId).toBeNull();
      expect(job.sectorId).toBeNull();
      expect(job.serviceSessionId).toBe(order.serviceSessionId);
      expect(printerConfigured).toBe(true);

      const content = job.contentSnapshot as {
        type: string;
        total: string;
        origins: {
          label: string;
          subtotal: string;
          payments: { amount: string; change: string | null }[];
        }[];
      };
      expect(content.type).toBe("PDV_SALE");
      expect(content.origins).toHaveLength(1);
      expect(content.origins[0]?.label).toBe("Loja");
      expect(content.origins[0]?.subtotal).toBe(formatBRL("40.00"));
      expect(content.origins[0]?.payments[0]?.amount).toBe(formatBRL("40.00"));
      expect(content.origins[0]?.payments[0]?.change).toBe(formatBRL("10.00")); // 50 - 40
      expect(content.total).toBe(formatBRL("40.00"));
    });

    it("é reimprimível — ao contrário de BILL_SUMMARY, o conteúdo fica congelado", async () => {
      const orderIdempotencyKey = `key-pdv-print-2-${Date.now()}-${Math.random()}`;
      const order = await sellPdv(waiterId, {
        restaurantId,
        waiterId,
        orderIdempotencyKey,
        items: [{ productId, quantity: 1 }],
        payments: [{ paymentMethodId, amount: 40, idempotencyKey: `${orderIdempotencyKey}-pay` }],
      });
      createdPdvSessionIds.push(order.serviceSessionId);

      const { job } = await createPdvSaleReceiptPrintJob(order.serviceSessionId);
      const reprinted = await createReprintJob(job.id);

      expect(reprinted.type).toBe("PDV_SALE");
      expect(reprinted.id).not.toBe(job.id);
      expect(reprinted.serviceSessionId).toBe(order.serviceSessionId);
      expect(reprinted.contentSnapshot).toEqual(job.contentSnapshot);
    });

    it("claim busca o conteúdo do recibo sem erro de validação", async () => {
      const orderIdempotencyKey = `key-pdv-print-3-${Date.now()}-${Math.random()}`;
      const order = await sellPdv(waiterId, {
        restaurantId,
        waiterId,
        orderIdempotencyKey,
        items: [{ productId, quantity: 1 }],
        payments: [{ paymentMethodId, amount: 40, idempotencyKey: `${orderIdempotencyKey}-pay` }],
      });
      createdPdvSessionIds.push(order.serviceSessionId);

      const { job } = await createPdvSaleReceiptPrintJob(order.serviceSessionId);
      const claimed = await claimPendingPrintJobs(printerId, 50);
      const ours = claimed.find((j) => j.id === job.id);
      expect(ours).toBeTruthy();
      expect(ours?.type).toBe("PDV_SALE");
      expect((ours?.content as { total: string }).total).toBeTruthy();
    });

    it("Pagamento Combinado (ADR 0010): discrimina mesa e loja no mesmo recibo", async () => {
      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: `PRINT-COMBO-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        },
      });
      createdTableIds.push(table.id);
      const session = await openTable({ tableId: table.id, waiterId, guestCount: 1 });
      const order = await createOrder({
        serviceSessionId: session.id,
        waiterId,
        idempotencyKey: `key-combo-print-${Date.now()}-${Math.random()}`,
        items: [{ productId, quantity: 1 }], // R$40,00
      });
      const tableItemId = order.items[0]!.id;

      const orderIdempotencyKey = `key-pdv-combo-print-${Date.now()}-${Math.random()}`;
      await registerCombinedCheckout({
        idempotencyKey: `combo-print-${Date.now()}-${Math.random()}`,
        registeredById: waiterId,
        table: {
          serviceSessionId: session.id,
          payments: [
            {
              paymentMethodId,
              idempotencyKey: `combo-print-mesa-${Date.now()}-${Math.random()}`,
              allocations: [{ type: "AMOUNT", orderItemIds: [tableItemId], mode: "FULL" }],
            },
          ],
        },
        pdv: {
          restaurantId,
          waiterId,
          orderIdempotencyKey,
          items: [{ productId, quantity: 1 }], // R$40,00
          payments: [{ paymentMethodId, amount: 40, idempotencyKey: `${orderIdempotencyKey}-pay` }],
        },
      });

      const pdvOrder = await prisma.order.findUniqueOrThrow({
        where: { idempotencyKey: orderIdempotencyKey },
      });
      createdPdvSessionIds.push(pdvOrder.serviceSessionId);

      const { job } = await createPdvSaleReceiptPrintJob(pdvOrder.serviceSessionId);
      const content = job.contentSnapshot as {
        total: string;
        origins: { label: string; subtotal: string; items: { label: string; amount: string }[] }[];
      };

      expect(content.origins).toHaveLength(2);
      // Mesa sempre primeiro, depois loja — nunca misturadas numa linha só.
      expect(content.origins[0]?.label).toBe(`Mesa ${table.number}`);
      expect(content.origins[0]?.subtotal).toBe(formatBRL("40.00"));
      expect(content.origins[0]?.items[0]?.amount).toBe(formatBRL("40.00"));
      expect(content.origins[1]?.label).toBe("Loja");
      expect(content.origins[1]?.subtotal).toBe(formatBRL("40.00"));
      expect(content.total).toBe(formatBRL("80.00"));
    });
  });
});
