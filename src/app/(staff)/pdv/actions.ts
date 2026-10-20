"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { sellPdv, SellPdvError } from "@/application/service-session/sell-pdv";
import {
  registerCombinedCheckout,
  CombinedCheckoutError,
} from "@/application/service-session/register-combined-checkout";
import { RegisterPaymentError } from "@/application/service-session/register-payment";
import type { AllocationRequest } from "@/application/service-session/register-payment";

export type FormState = { error: string | null; success?: boolean };

const cartSchema = z.array(
  z.object({ productId: z.string().min(1), quantity: z.number().int().min(1) }),
);
const paymentsSchema = z.array(
  z.object({
    paymentMethodId: z.string().min(1),
    amount: z.number().positive(),
    idempotencyKey: z.string().min(1),
  }),
);

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

  try {
    await sellPdv(user.id, {
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

  revalidatePath("/pdv");
  revalidatePath("/mesas");
  if (tableId) {
    revalidatePath(`/mesas/${tableId}`);
    revalidatePath(`/mesas/${tableId}/pagamentos`);
  }
  return { error: null, success: true };
}
