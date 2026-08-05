import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPrinterToken } from "@/lib/printing/token";
import { ticketContentSchema, buildTicketContent } from "@/domain/printing/ticket";
import { canTransitionPrintJob } from "@/domain/printing/states";
import { publishChange } from "@/lib/realtime/publish";
import { sectorChannel } from "@/lib/realtime/channels";

export class PrintJobError extends Error {}

// Autentica o agente local pelo token (Authorization: Bearer) — compara o
// hash, nunca o texto puro (docs/printing/architecture.md).
export async function findPrinterByToken(token: string) {
  if (!token) return null;
  const tokenHash = hashPrinterToken(token);
  return prisma.printer.findFirst({ where: { agentTokenHash: tokenHash, active: true } });
}

// O agente chama isso pra puxar trabalho. Marca como PROCESSING no mesmo
// fôlego (claim) — evita reprocessar o mesmo job se o agente cair e subir
// de novo antes de confirmar. Não usa `SELECT ... FOR UPDATE SKIP LOCKED`
// porque o MVP roda um único agente por impressora; se um dia houver mais
// de um consumidor concorrente na mesma fila, isso precisa mudar.
export async function claimPendingPrintJobs(printerId: string, limit = 10) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.printJob.findMany({
      where: { printerId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    await tx.printJob.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "PROCESSING" },
    });

    return candidates.map((job) => ({
      id: job.id,
      type: job.type,
      attempts: job.attempts,
      content: ticketContentSchema.parse(job.contentSnapshot),
    }));
  });
}

async function transitionJob(printerId: string, jobId: string, toStatus: "PRINTED" | "FAILED", error?: string) {
  const job = await prisma.printJob.findUnique({ where: { id: jobId } });
  if (!job || job.printerId !== printerId) {
    throw new PrintJobError("Job não encontrado para esta impressora.");
  }
  if (!canTransitionPrintJob(job.status, toStatus)) {
    throw new PrintJobError(`Job não está em processamento (status atual: ${job.status}).`);
  }

  return prisma.printJob.update({
    where: { id: jobId },
    data:
      toStatus === "PRINTED"
        ? { status: "PRINTED", printedAt: new Date() }
        : { status: "FAILED", lastError: error ?? "Erro não informado", attempts: { increment: 1 } },
  });
}

export async function markPrintJobPrinted(printerId: string, jobId: string) {
  return transitionJob(printerId, jobId, "PRINTED");
}

export async function markPrintJobFailed(printerId: string, jobId: string, error: string) {
  return transitionJob(printerId, jobId, "FAILED", error);
}

// Ação manual do admin/caixa/produção (tela /admin/impressao) — devolve um
// job que falhou para o início da fila, mesmo conteúdo, sem zerar
// `attempts` (histórico de tentativas continua visível).
export async function reprocessPrintJob(jobId: string) {
  const job = await prisma.printJob.findUniqueOrThrow({ where: { id: jobId } });
  if (!canTransitionPrintJob(job.status, "PENDING")) {
    throw new PrintJobError("Só é possível reprocessar um job que falhou.");
  }
  const updated = await prisma.printJob.update({
    where: { id: jobId },
    data: { status: "PENDING", lastError: null },
  });
  if (updated.printerId) {
    await publishChange([sectorChannel(updated.sectorId)], "print_job.requeued");
  }
  return updated;
}

// Reimpressão manual (CLAUDE.md seção 20 — tipo "reimpressão"; seção 5 —
// Caixa reimprime conferências, Produção reimprime pedidos quando
// autorizada). Cria um PrintJob novo — nunca reaproveita o antigo, para
// manter o histórico de cada tentativa/impressão intacto (regra 7/8: não
// apagar, não sobrescrever registro operacional).
export async function createReprintJob(originalJobId: string) {
  const original = await prisma.printJob.findUniqueOrThrow({
    where: { id: originalJobId },
    include: { order: { include: { serviceSession: { include: { table: true } } } } },
  });
  const originalContent = ticketContentSchema.parse(original.contentSnapshot);

  const printer = await prisma.printer.findFirst({
    where: { restaurantId: original.order.serviceSession.table.restaurantId, active: true },
  });

  // generatedAt não vem do original — reimpressão mostra a hora de agora,
  // não a do pedido original (o conteúdo em si, esse sim, é idêntico).
  const content = buildTicketContent({
    type: "REPRINT",
    restaurantName: originalContent.restaurantName,
    tableNumber: originalContent.tableNumber,
    waiterName: originalContent.waiterName,
    sectorName: originalContent.sectorName,
    orderSequenceNumber: originalContent.orderSequenceNumber,
    items: originalContent.items,
    cancelReason: originalContent.cancelReason,
  });

  const created = await prisma.printJob.create({
    data: {
      orderId: original.orderId,
      sectorId: original.sectorId,
      printerId: printer?.id ?? original.printerId,
      type: "REPRINT",
      contentSnapshot: content,
    },
  });

  if (created.printerId) {
    await publishChange([sectorChannel(created.sectorId)], "print_job.created");
  }

  return created;
}
