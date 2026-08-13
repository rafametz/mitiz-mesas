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
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    waiterId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    categoryId = (
      await prisma.category.create({ data: { restaurantId, name: `Cat print ${suffix}` } })
    ).id;
    sectorId = (
      await prisma.productionSector.create({ data: { restaurantId, name: `Setor print ${suffix}` } })
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
  });

  afterAll(async () => {
    await prisma.printJob.deleteMany({
      where: { OR: [{ sectorId }, { serviceSession: { tableId: { in: createdTableIds } } }] },
    });
    await prisma.payment.deleteMany({ where: { paymentMethodId } });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.printer.deleteMany({ where: { id: printerId } });
    await prisma.paymentMethod.deleteMany({ where: { id: paymentMethodId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.productionSector.deleteMany({ where: { id: sectorId } });
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
    expect(claimedOurs?.content.tableNumber).toBeTruthy();

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
        data: { restaurantId, number: `PRINT-BILL-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
        data: { restaurantId, number: `PRINT-BILL-PAY-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
        data: { restaurantId, number: `PRINT-BILL-RE-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
        data: { restaurantId, number: `PRINT-BILL-CLAIM-${Date.now()}-${Math.random().toString(36).slice(2)}` },
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
});
