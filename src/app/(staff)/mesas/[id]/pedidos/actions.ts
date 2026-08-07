"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import {
  createOrder,
  CreateOrderError,
  type CreateOrderItemInput,
} from "@/application/order/create-order";
import {
  authorizeCancelOrderItem,
  CancelOrderItemError,
  requestCancelOrderItem,
} from "@/application/order/cancel-order-item";
import { setToastCookie } from "@/lib/toast-cookie";

export type FormState = { error: string | null };

const cartSchema = z.array(
  z.object({
    productId: z.string(),
    quantity: z.number(),
    guestId: z.string().optional(),
    meatPoint: z.string().optional(),
    notes: z.string().optional(),
    modifierIds: z.array(z.string()),
  }),
);

export async function createOrderAction(
  tableId: string,
  serviceSessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ORDERS_CREATE);

  let items: CreateOrderItemInput[];
  try {
    items = cartSchema.parse(
      JSON.parse(String(formData.get("cartJson") ?? "[]")),
    ) as CreateOrderItemInput[];
  } catch {
    return { error: "Carrinho inválido — atualize a página e tente de novo." };
  }
  if (items.length === 0) {
    return { error: "Adicione ao menos um item ao pedido." };
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Falha interna (sem chave de idempotência) — atualize a página." };
  }

  try {
    await createOrder({ serviceSessionId, waiterId: user.id, idempotencyKey, items });
  } catch (error) {
    if (error instanceof CreateOrderError) return { error: error.message };
    // Erro inesperado (não é regra de negócio) — a mensagem pro usuário
    // fica genérica de propósito, mas o log completo precisa sobreviver
    // em algum lugar (Vercel > projeto > Logs) pra dar pra diagnosticar.
    // Causa raiz confirmada 2026-08-06 (Mesa 2, com diagnóstico temporário
    // ligado): P2028 "Transaction not found" — timeout padrão de 5s da
    // transação interativa do Prisma estourando contra o pooler do
    // Supabase em produção. Corrigido com timeout maior + retry em
    // create-order.ts; mantendo o catch genérico aqui como rede de
    // segurança para qualquer outra falha inesperada.
    console.error("[createOrderAction] erro inesperado ao criar pedido:", error);
    return { error: "Não foi possível enviar o pedido. Tente de novo." };
  }

  revalidatePath(`/mesas/${tableId}/pedidos`);
  revalidatePath(`/mesas/${tableId}`);
  // createOrderAction redireciona em vez de devolver estado no sucesso,
  // então o useActionState do formulário nunca vê um "sucesso" pra
  // disparar toast (Fase 4 do plano de modernização). Em vez de marcar a
  // URL de destino (quebraria os `toHaveURL(/\/pedidos$/)` do E2E), um
  // cookie de vida curta avisa a página seguinte — lido e apagado
  // inteiramente no cliente (OrderSentToast, em pedidos/page.tsx), nunca
  // vira dado de negócio nem aparece em log.
  await setToastCookie("Pedido enviado.");
  redirect(`/mesas/${tableId}/pedidos`);
}

function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

export async function requestCancelAction(
  itemId: string,
  tableId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ORDERS_CANCEL_REQUEST);
  try {
    await requestCancelOrderItem(itemId, user.id, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof CancelOrderItemError) return { error: error.message };
    const zodMessage = firstZodMessage(error);
    if (zodMessage) return { error: zodMessage };
    return { error: "Não foi possível solicitar o cancelamento." };
  }
  revalidatePath(`/mesas/${tableId}/pedidos`);
  return { error: null };
}

export async function authorizeCancelAction(
  itemId: string,
  tableId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ORDERS_CANCEL_AUTHORIZE);
  try {
    await authorizeCancelOrderItem(itemId, user.id, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof CancelOrderItemError) return { error: error.message };
    const zodMessage = firstZodMessage(error);
    if (zodMessage) return { error: zodMessage };
    return { error: "Não foi possível cancelar o item." };
  }
  revalidatePath(`/mesas/${tableId}/pedidos`);
  return { error: null };
}
