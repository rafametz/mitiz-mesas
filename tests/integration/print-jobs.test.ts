import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/application/order/create-order";
import { openTable } from "@/application/service-session/open-table";
import { authorizeCancelOrderItem } from "@/application/order/cancel-order-item";
import {
  claimPendingPrintJobs,
  createReprintJob,
  findPrinterByToken,
  markPrintJobFailed,
  markPrintJobPrinted,
  reprocessPrintJob,
} from "@/application/printing/print-queue";
import { generatePrinterToken, hashPrinterToken } from "@/lib/printing/token";

describe("PrintJob (Módulo 7 — impressão)", () => {
  let restaurantId: string;
  let waiterId: string;
  let productId: string;
  let categoryId: string;
  let sectorId: string;
  let printerId: string;
  let printerToken: string;
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
  });

  afterAll(async () => {
    await prisma.printJob.deleteMany({ where: { sectorId } });
    await prisma.orderItem.deleteMany({ where: { productId } });
    await prisma.order.deleteMany({
      where: { serviceSession: { tableId: { in: createdTableIds } } },
    });
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.printer.deleteMany({ where: { id: printerId } });
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
});
