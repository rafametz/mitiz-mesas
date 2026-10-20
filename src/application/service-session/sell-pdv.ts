import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createOrderInTx,
  createOrderSchema,
  CreateOrderError,
} from "@/application/order/create-order";
import { registerPaymentInTx, registerSchema, RegisterPaymentError } from "./register-payment";
import { requestClosingInTx, RequestClosingError } from "./request-closing";
import { closeTableInTx, CloseTableError } from "./close-table";
import { canCloseTable } from "@/domain/service-session/closing";
import { isValidPdvPaymentLine } from "@/domain/service-session/combined-checkout";
import { createPrintJobsForOrder } from "@/application/printing/create-print-jobs";
import { publishChange } from "@/lib/realtime/publish";
import { sectorChannel } from "@/lib/realtime/channels";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class SellPdvError extends Error {}

// Venda de balcão (PDV, Módulo 17 — docs/backlog.md, Fase 2 do roadmap
// MITIZ Gestão): reaproveita ServiceSession/Order/Payment como qualquer
// outro atendimento, só que nasce, recebe e fecha numa confirmação só —
// "fecha sozinho" ao zerar o saldo, sem passar por "solicitar fechamento"
// como ação do operador (decisão do usuário 2026-10-15, ADR 0010). Preço
// sempre por unidade nesta versão (venda por peso fora do v1, decisão
// confirmada na visão da Fase 2).
export const pdvSaleSchema = z.object({
  restaurantId: z.string().min(1),
  waiterId: z.string().min(1),
  orderIdempotencyKey: z.string().min(1),
  items: createOrderSchema.shape.items,
  // Cada linha paga o valor cheio da venda (sempre amount — nunca
  // allocations, que não existe para produto de loja). Mais de uma linha =
  // mais de uma forma de pagamento (regra 13 do CLAUDE.md).
  payments: z.array(registerSchema).min(1),
});

export type SellPdvInput = z.input<typeof pdvSaleSchema>;

// Núcleo da venda, parametrizado numa transação já aberta — usado sozinho
// por `sellPdv` (venda pura de balcão) e também pelo orquestrador do
// Pagamento Combinado (`registerCombinedCheckoutInTx`, ADR 0010), que
// passa `options.combinedCheckoutId` pra etiquetar os Payment desta venda
// como parte de uma operação que também cobriu consumo de mesa — mesmo
// núcleo, sem duplicar a criação da sessão/pedido/fechamento em dois
// lugares.
export async function sellPdvInTx(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  data: z.infer<typeof pdvSaleSchema>,
  options?: { combinedCheckoutId?: string },
) {
  // Idempotência (regra 18/19): checada ANTES de criar a sessão do PDV —
  // nunca depois (correção: a primeira versão desta função criava a
  // sessão primeiro e só descobria a repetição dentro de createOrderInTx,
  // deixando uma sessão órfã, sem pedido, presa em OPEN a cada duplo
  // toque em "Confirmar"). Repetir a mesma chave devolve a venda já
  // criada, sem tocar em nada.
  const existingOrder = await tx.order.findUnique({
    where: { idempotencyKey: data.orderIdempotencyKey },
  });
  if (existingOrder) {
    const pdvSession = await tx.serviceSession.findUniqueOrThrow({
      where: { id: existingOrder.serviceSessionId },
    });
    return { pdvSession, order: existingOrder, created: false as const };
  }

  for (const line of data.payments) {
    if (!isValidPdvPaymentLine(line)) {
      throw new SellPdvError("Pagamento da venda precisa informar o valor, sem seleção de itens.");
    }
  }

  const pdvSessionOpen = await tx.serviceSession.create({
    data: {
      restaurantId: data.restaurantId,
      type: "PDV",
      waiterId: data.waiterId,
      guestCount: 1,
    },
  });

  const orderResult = await createOrderInTx(tx, {
    serviceSessionId: pdvSessionOpen.id,
    waiterId: data.waiterId,
    idempotencyKey: data.orderIdempotencyKey,
    items: data.items,
  });
  // Defensivo — já checamos a chave acima, antes de criar a sessão, e
  // nada mais escreve nela dentro desta mesma transação; na prática nunca
  // deveria cair aqui.
  if (!orderResult.created) {
    throw new SellPdvError("Chave de idempotência do pedido já usada por outro pedido.");
  }

  await requestClosingInTx(tx, pdvSessionOpen.id, actorUserId);

  for (const line of data.payments) {
    await registerPaymentInTx(tx, pdvSessionOpen.id, actorUserId, line, {
      combinedCheckoutId: options?.combinedCheckoutId,
    });
  }

  const sessionBeforeClose = await tx.serviceSession.findUniqueOrThrow({
    where: { id: pdvSessionOpen.id },
  });
  if (!canCloseTable(sessionBeforeClose.status, sessionBeforeClose.balanceAmount)) {
    throw new SellPdvError(
      `Pagamento não cobriu o valor da venda (saldo restante: R$ ${sessionBeforeClose.balanceAmount.toFixed(2)}).`,
    );
  }
  await closeTableInTx(tx, pdvSessionOpen.id, actorUserId);

  const pdvSession = await tx.serviceSession.findUniqueOrThrow({
    where: { id: pdvSessionOpen.id },
  });

  return { pdvSession, order: orderResult, created: true as const };
}

export const sellPdvTransactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 15000,
} satisfies Parameters<typeof prisma.$transaction>[1];

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2034" || error.code === "P2028";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /could not serialize|deadlock detected/i.test(error.message);
  }
  return false;
}

// Confirma uma venda de balcão pura (sem consumo de mesa — ver
// registerCombinedCheckout para o caso combinado). Idempotente de verdade
// (regra 18/19): a chave do pedido repetida devolve a venda já criada,
// nunca duplica.
export async function sellPdv(actorUserId: string, input: SellPdvInput) {
  const data = pdvSaleSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        (tx) => sellPdvInTx(tx, actorUserId, data),
        sellPdvTransactionOptions,
      );

      if (!result.created) return result.order;

      const channels = [
        ...sessionRealtimeChannels(result.pdvSession),
        ...result.order.sectorIds.map(sectorChannel),
      ];

      await runAfterResponse(async () => {
        try {
          await createPrintJobsForOrder(prisma, {
            order: result.order.order,
            restaurantId: result.order.restaurantId,
            restaurantName: result.order.restaurantName,
            header: result.order.header,
            waiterName: result.order.waiterName,
            responsibleName: result.order.responsibleName,
          });
        } catch (error) {
          console.error(
            `[sellPdv] falha ao criar PrintJob do pedido ${result.order.order.id}:`,
            error,
          );
        }
      });

      await runAfterResponse(() => publishChange(channels, "pdv_sale.registered"));

      return result.order.order;
    } catch (error) {
      if (
        error instanceof SellPdvError ||
        error instanceof CreateOrderError ||
        error instanceof RegisterPaymentError ||
        error instanceof RequestClosingError ||
        error instanceof CloseTableError
      ) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: data.orderIdempotencyKey },
        });
        if (existing) return existing;
      }

      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível registrar a venda.");
}
