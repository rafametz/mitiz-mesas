import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createOrderSchema, CreateOrderError } from "@/application/order/create-order";
import { registerPaymentInTx, registerSchema, RegisterPaymentError } from "./register-payment";
import { RequestClosingError } from "./request-closing";
import { CloseTableError } from "./close-table";
import { sellPdvInTx, SellPdvError } from "./sell-pdv";
import { isValidTablePaymentLine } from "@/domain/service-session/combined-checkout";
import { createPrintJobsForOrder } from "@/application/printing/create-print-jobs";
import { publishChange } from "@/lib/realtime/publish";
import { sectorChannel } from "@/lib/realtime/channels";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class CombinedCheckoutError extends Error {}

// Pagamento Combinado (ADR 0010, docs/architecture/decisions/0010-pagamento-combinado-mesa-pdv.md):
// uma confirmação só que cobre consumo já lançado numa mesa aberta + uma
// venda de balcão (PDV) nova, com um Payment por origem (nunca um Payment
// só cobrindo as duas) agrupados por CombinedCheckout. Mesa nunca fecha
// por conta disto; o PDV fecha sozinho (decisão do usuário) ao zerar o
// saldo, exatamente como fecharia numa venda de balcão pura.
export const registerCombinedCheckoutSchema = z.object({
  idempotencyKey: z.string().min(1),
  registeredById: z.string().min(1),
  table: z.object({
    serviceSessionId: z.string().min(1),
    // Cada linha paga uma seleção de consumo (sempre allocations — nunca
    // um valor livre dentro do checkout combinado, seção 6 da ADR).
    // Mais de uma linha = mais de uma forma de pagamento para a mesma
    // seleção de mesa.
    payments: z.array(registerSchema).min(1),
  }),
  pdv: z.object({
    restaurantId: z.string().min(1),
    waiterId: z.string().min(1),
    orderIdempotencyKey: z.string().min(1),
    items: createOrderSchema.shape.items,
    // Cada linha paga o valor cheio da venda (sempre amount — nunca
    // allocations, que não existe para produto de loja).
    payments: z.array(registerSchema).min(1),
  }),
});

export type RegisterCombinedCheckoutInput = z.input<typeof registerCombinedCheckoutSchema>;

// Núcleo do checkout combinado, parametrizado numa transação já aberta —
// a perna do PDV reaproveita sellPdvInTx (venda de balcão, mesmo núcleo da
// venda pura) e a perna da mesa reaproveita registerPaymentInTx
// diretamente, sem duplicar nenhuma validação ou regra de saldo/
// idempotência delas.
export async function registerCombinedCheckoutInTx(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof registerCombinedCheckoutSchema>,
) {
  // Idempotência do conjunto (regra 18/19): duplo toque em "Confirmar"
  // devolve a operação já criada, nunca cria de novo — inclusive uma
  // segunda sessão de PDV (ela só nasce depois desta checagem).
  const existingCheckout = await tx.combinedCheckout.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
  });
  if (existingCheckout) {
    return {
      combinedCheckout: existingCheckout,
      created: false as const,
      tableSession: null,
      pdvSession: null,
      pdvOrder: null,
    };
  }

  for (const line of data.table.payments) {
    if (!isValidTablePaymentLine(line)) {
      throw new CombinedCheckoutError(
        "Pagamento da mesa precisa informar os itens ou frações selecionados.",
      );
    }
  }

  const tableSession = await tx.serviceSession.findUniqueOrThrow({
    where: { id: data.table.serviceSessionId },
  });
  if (tableSession.restaurantId !== data.pdv.restaurantId) {
    throw new CombinedCheckoutError("Mesa e venda de balcão pertencem a restaurantes diferentes.");
  }

  const combinedCheckout = await tx.combinedCheckout.create({
    data: {
      restaurantId: data.pdv.restaurantId,
      registeredById: data.registeredById,
      idempotencyKey: data.idempotencyKey,
    },
  });

  const pdvResult = await sellPdvInTx(
    tx,
    data.registeredById,
    {
      restaurantId: data.pdv.restaurantId,
      waiterId: data.pdv.waiterId,
      orderIdempotencyKey: data.pdv.orderIdempotencyKey,
      items: data.pdv.items,
      payments: data.pdv.payments,
    },
    { combinedCheckoutId: combinedCheckout.id },
  );
  // Defensivo — o CombinedCheckout acabou de nascer agora mesmo (checagem
  // de idempotência do conjunto no topo desta função), então a chave do
  // pedido do PDV não deveria já existir; só cai aqui com um bug no
  // chamador (reaproveitar uma orderIdempotencyKey de outra venda).
  if (!pdvResult.created) {
    throw new CombinedCheckoutError(
      "Chave de idempotência do pedido da loja já usada por outro pedido.",
    );
  }

  for (const line of data.table.payments) {
    await registerPaymentInTx(tx, data.table.serviceSessionId, data.registeredById, line, {
      combinedCheckoutId: combinedCheckout.id,
    });
  }

  const freshTableSession = await tx.serviceSession.findUniqueOrThrow({
    where: { id: data.table.serviceSessionId },
  });

  return {
    combinedCheckout,
    created: true as const,
    tableSession: freshTableSession,
    pdvSession: pdvResult.pdvSession,
    pdvOrder: pdvResult.order,
  };
}

// Mesmas opções de isolamento/timeout de createOrder (Serializable: reduz
// a janela de corrida na seleção de consumo da mesa e no sequenceNumber
// do pedido do PDV; timeout maior por fazer várias idas e vindas via
// pooler do Supabase).
export const registerCombinedCheckoutTransactionOptions = {
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

// Confirma o Pagamento Combinado (ADR 0010): consumo de mesa selecionado
// + venda de balcão, um recebimento só. Idempotente de verdade (chave
// repetida devolve a mesma operação); concorrência nos itens da mesa já
// resolvida de graça por resolveAllocations (dentro de registerPaymentInTx)
// revalidar o saldo real dentro da própria transação.
export async function registerCombinedCheckout(input: RegisterCombinedCheckoutInput) {
  const data = registerCombinedCheckoutSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        (tx) => registerCombinedCheckoutInTx(tx, data),
        registerCombinedCheckoutTransactionOptions,
      );

      if (result.created && result.tableSession && result.pdvSession && result.pdvOrder) {
        const channels = [
          ...sessionRealtimeChannels(result.tableSession),
          ...sessionRealtimeChannels(result.pdvSession),
          ...result.pdvOrder.sectorIds.map(sectorChannel),
        ];

        await runAfterResponse(async () => {
          try {
            await createPrintJobsForOrder(prisma, {
              order: result.pdvOrder.order,
              restaurantId: result.pdvOrder.restaurantId,
              restaurantName: result.pdvOrder.restaurantName,
              header: result.pdvOrder.header,
              waiterName: result.pdvOrder.waiterName,
              responsibleName: result.pdvOrder.responsibleName,
            });
          } catch (error) {
            console.error(
              `[registerCombinedCheckout] falha ao criar PrintJob do pedido ${result.pdvOrder.order.id}:`,
              error,
            );
          }
        });

        await runAfterResponse(() => publishChange(channels, "combined_checkout.registered"));
      }

      return result.combinedCheckout;
    } catch (error) {
      if (
        error instanceof CombinedCheckoutError ||
        error instanceof SellPdvError ||
        error instanceof CreateOrderError ||
        error instanceof RegisterPaymentError ||
        error instanceof RequestClosingError ||
        error instanceof CloseTableError
      ) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.combinedCheckout.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });
        if (existing) return existing;
      }

      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível registrar o checkout combinado.");
}
