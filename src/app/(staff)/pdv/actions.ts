"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { sellPdv, SellPdvError } from "@/application/service-session/sell-pdv";
import {
  registerCombinedCheckout,
  CombinedCheckoutError,
} from "@/application/service-session/register-combined-checkout";
import { RegisterPaymentError } from "@/application/service-session/register-payment";
import type { AllocationRequest } from "@/application/service-session/register-payment";
import { createPdvSaleReceiptPrintJob } from "@/application/printing/create-pdv-sale-receipt-print-job";
import { runAfterResponse } from "@/lib/run-after-response";

export type FormState = { error: string | null; success?: boolean };

const cartSchema = z.array(
  z.object({ productId: z.string().min(1), quantity: z.number().int().min(1) }),
);
const paymentsSchema = z.array(
  z.object({
    paymentMethodId: z.string().min(1),
    amount: z.number().positive(),
    idempotencyKey: z.string().min(1),
    // Só para o recibo (troco impresso) — decisão do usuário, visão da
    // Fase 2: "troco é só cálculo de tela", nunca influencia o valor
    // registrado em sellPdv/registerCombinedCheckout, que nem recebem
    // este campo (ver createPdvSaleReceiptPrintJob).
    cashReceived: z.number().positive().optional(),
  }),
);

function cashReceivedMap(payments: z.infer<typeof paymentsSchema>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const payment of payments) {
    if (payment.cashReceived !== undefined)
      map[payment.idempotencyKey] = String(payment.cashReceived);
  }
  return map;
}

// Mesmo padrão de createOrder/sellPdv: `await` aqui (não dispara e
// esquece) — dentro de uma requisição real do Next.js, `after()` só
// agenda e volta na hora, então o `await` não atrasa a resposta; fora de
// uma requisição (testes/scripts), `runAfterResponse` cai para rodar e
// esperar `fn()` direto, e sem este `await` esse caminho ficaria
// desacompanhado.
async function schedulePdvSaleReceipt(pdvSessionId: string, cashReceived: Record<string, string>) {
  await runAfterResponse(async () => {
    try {
      await createPdvSaleReceiptPrintJob(pdvSessionId, cashReceived);
    } catch (error) {
      console.error(`[pdv] falha ao criar o recibo da venda ${pdvSessionId}:`, error);
    }
  });
}

// Carrinho e formas de pagamento montados no cliente (nada gravado até
// aqui) e enviados como JSON em campos escondidos — mesmo padrão já usado
// em mesas/[id]/pedidos (cartJson) e mesas/[id]/pagamentos (allocationsJson),
// porque FormData não carrega array aninhado. sellPdv revalida tudo contra
// o banco dentro da transação (CLAUDE.md regra 24).
export async function sellPdvAction(
  restaurantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PDV_SELL);

  const orderIdempotencyKey = String(formData.get("orderIdempotencyKey") ?? "");
  if (!orderIdempotencyKey) {
    return { error: "Falha interna (sem chave de idempotência). Atualize a página." };
  }

  let items: z.infer<typeof cartSchema>;
  let payments: z.infer<typeof paymentsSchema>;
  try {
    items = cartSchema.parse(JSON.parse(String(formData.get("cartJson") ?? "[]")));
    payments = paymentsSchema.parse(JSON.parse(String(formData.get("paymentsJson") ?? "[]")));
  } catch {
    return { error: "Carrinho ou pagamento inválido. Atualize a página e tente de novo." };
  }
  if (items.length === 0) return { error: "Adicione ao menos um produto à venda." };
  if (payments.length === 0) return { error: "Informe ao menos uma forma de pagamento." };

  let order;
  try {
    order = await sellPdv(user.id, {
      restaurantId,
      waiterId: user.id,
      orderIdempotencyKey,
      items,
      payments,
    });
  } catch (error) {
    if (error instanceof SellPdvError) return { error: error.message };
    console.error("[sellPdvAction] erro inesperado ao registrar venda:", error);
    return { error: "Não foi possível registrar a venda. Tente de novo." };
  }

  await schedulePdvSaleReceipt(order.serviceSessionId, cashReceivedMap(payments));

  revalidatePath("/pdv");
  return { error: null, success: true };
}

// Pagamento Combinado (ADR 0010, docs/architecture/decisions/0010-pagamento-combinado-mesa-pdv.md):
// "+ Adicionar consumo de mesa" dentro do PDV. A perna da mesa sempre vem
// como UMA linha de pagamento (uma forma só) cobrindo toda a seleção —
// dividir o valor da mesa entre várias formas fica para uma extensão
// futura (decisão: manter o caso comum simples primeiro); a perna da
// loja já aceita múltiplas formas, igual a sellPdvAction.
export async function registerCombinedCheckoutAction(
  restaurantId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PDV_SELL);

  const combinedIdempotencyKey = String(formData.get("combinedIdempotencyKey") ?? "");
  const orderIdempotencyKey = String(formData.get("orderIdempotencyKey") ?? "");
  const tableSessionId = String(formData.get("tableSessionId") ?? "");
  const tableId = String(formData.get("tableId") ?? "");
  const tablePaymentMethodId = String(formData.get("tablePaymentMethodId") ?? "");
  const tablePaymentIdempotencyKey = String(formData.get("tablePaymentIdempotencyKey") ?? "");
  if (
    !combinedIdempotencyKey ||
    !orderIdempotencyKey ||
    !tableSessionId ||
    !tablePaymentMethodId ||
    !tablePaymentIdempotencyKey
  ) {
    return { error: "Falha interna (dados incompletos). Atualize a página." };
  }

  let items: z.infer<typeof cartSchema>;
  let payments: z.infer<typeof paymentsSchema>;
  let tableAllocations: AllocationRequest[];
  try {
    items = cartSchema.parse(JSON.parse(String(formData.get("cartJson") ?? "[]")));
    payments = paymentsSchema.parse(JSON.parse(String(formData.get("paymentsJson") ?? "[]")));
    tableAllocations = JSON.parse(String(formData.get("tableAllocationsJson") ?? "[]"));
  } catch {
    return { error: "Carrinho ou pagamento inválido. Atualize a página e tente de novo." };
  }
  if (items.length === 0) return { error: "Adicione ao menos um produto à venda." };
  if (payments.length === 0)
    return { error: "Informe ao menos uma forma de pagamento para a loja." };
  if (!Array.isArray(tableAllocations) || tableAllocations.length === 0) {
    return { error: "Selecione ao menos um item da mesa." };
  }

  try {
    await registerCombinedCheckout({
      idempotencyKey: combinedIdempotencyKey,
      registeredById: user.id,
      table: {
        serviceSessionId: tableSessionId,
        payments: [
          {
            paymentMethodId: tablePaymentMethodId,
            idempotencyKey: tablePaymentIdempotencyKey,
            allocations: tableAllocations,
          },
        ],
      },
      pdv: {
        restaurantId,
        waiterId: user.id,
        orderIdempotencyKey,
        items,
        payments,
      },
    });
  } catch (error) {
    if (
      error instanceof CombinedCheckoutError ||
      error instanceof SellPdvError ||
      error instanceof RegisterPaymentError
    ) {
      return { error: error.message };
    }
    console.error(
      "[registerCombinedCheckoutAction] erro inesperado ao registrar venda combinada:",
      error,
    );
    return { error: "Não foi possível registrar a venda. Tente de novo." };
  }

  // O pedido da loja é a forma mais direta de achar a sessão do PDV que
  // acabou de nascer (registerCombinedCheckout devolve só o
  // CombinedCheckout, que agrupa os dois Payment — não expõe os ids de
  // sessão diretamente) — a chave já é única por confirmação.
  const pdvOrder = await prisma.order.findUnique({
    where: { idempotencyKey: orderIdempotencyKey },
    select: { serviceSessionId: true },
  });
  if (pdvOrder) await schedulePdvSaleReceipt(pdvOrder.serviceSessionId, cashReceivedMap(payments));

  revalidatePath("/pdv");
  revalidatePath("/mesas");
  if (tableId) {
    revalidatePath(`/mesas/${tableId}`);
    revalidatePath(`/mesas/${tableId}/pagamentos`);
  }
  return { error: null, success: true };
}
