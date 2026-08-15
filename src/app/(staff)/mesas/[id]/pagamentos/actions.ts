"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DiscountType } from "@prisma/client";
import { requireAnyPermission, requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { requestClosing, RequestClosingError } from "@/application/service-session/request-closing";
import {
  cancelClosingRequest,
  CancelClosingRequestError,
} from "@/application/service-session/cancel-closing-request";
import {
  applyDiscount,
  ApplyDiscountError,
  voidDiscount,
} from "@/application/service-session/apply-discount";
import {
  applyServiceCharge,
  ApplyServiceChargeError,
} from "@/application/service-session/apply-service-charge";
import {
  registerPayment,
  RegisterPaymentError,
  voidPayment,
  type AllocationRequest,
} from "@/application/service-session/register-payment";
import {
  setOrderItemShareParts,
  SetOrderItemShareError,
} from "@/application/service-session/set-order-item-share";
import { closeTable, CloseTableError } from "@/application/service-session/close-table";

export type FormState = { error: string | null; success?: boolean };

// `redirectPath`/`listPath` são `/mesas/{id}` ou `/retiradas/{id}` (módulo
// Retiradas, 2026-08-14) — só usados para revalidar/redirecionar; as
// ações em si só dependem de serviceSessionId. Mesmas ações servem os
// dois fluxos (reaproveitamento pedido pelo usuário).
function revalidateAtendimento(redirectPath: string) {
  revalidatePath(redirectPath);
  revalidatePath(`${redirectPath}/pagamentos`);
}

export async function requestClosingAction(redirectPath: string, sessionId: string) {
  const user = await requireAnyPermission([PERMISSIONS.TABLES_CLOSE_REQUEST, PERMISSIONS.TABLES_CLOSE]);
  try {
    await requestClosing(sessionId, user.id);
  } catch (error) {
    if (error instanceof RequestClosingError) throw error;
    throw new Error("Não foi possível solicitar o fechamento.");
  }
  revalidateAtendimento(redirectPath);
  redirect(`${redirectPath}/pagamentos`);
}

// Volta CLOSING -> OPEN (revisão 2026-08-10) — "pedi a conta por engano"
// ou o cliente quer pedir mais alguma coisa. Mesma permissão de quem pode
// solicitar o fechamento.
export async function cancelClosingRequestAction(redirectPath: string, sessionId: string) {
  const user = await requireAnyPermission([PERMISSIONS.TABLES_CLOSE_REQUEST, PERMISSIONS.TABLES_CLOSE]);
  try {
    await cancelClosingRequest(sessionId, user.id);
  } catch (error) {
    if (error instanceof CancelClosingRequestError) throw error;
    throw new Error("Não foi possível cancelar a solicitação de fechamento.");
  }
  revalidateAtendimento(redirectPath);
  redirect(redirectPath);
}

export async function applyDiscountAction(
  redirectPath: string,
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.DISCOUNTS_APPLY);
  try {
    await applyDiscount(sessionId, user.id, {
      type: String(formData.get("type") ?? "") as DiscountType,
      value: String(formData.get("value") ?? ""),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    if (error instanceof ApplyDiscountError) return { error: error.message };
    return { error: "Não foi possível aplicar o desconto." };
  }
  revalidateAtendimento(redirectPath);
  return { error: null, success: true };
}

export async function voidDiscountAction(
  redirectPath: string,
  discountId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.DISCOUNTS_APPLY);
  try {
    await voidDiscount(discountId, user.id, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof ApplyDiscountError) return { error: error.message };
    return { error: "Não foi possível anular o desconto." };
  }
  revalidateAtendimento(redirectPath);
  return { error: null, success: true };
}

export async function applyServiceChargeAction(
  redirectPath: string,
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAnyPermission([PERMISSIONS.DISCOUNTS_APPLY, PERMISSIONS.PAYMENTS_REGISTER]);
  const waived = formData.get("waived") === "on";
  try {
    await applyServiceCharge(sessionId, user.id, {
      percent: waived ? "0" : String(formData.get("percent") ?? "0"),
      waived,
      waivedReason: String(formData.get("waivedReason") ?? ""),
    });
  } catch (error) {
    if (error instanceof ApplyServiceChargeError) return { error: error.message };
    return { error: "Não foi possível aplicar a taxa de serviço." };
  }
  revalidateAtendimento(redirectPath);
  return { error: null, success: true };
}

export async function registerPaymentAction(
  redirectPath: string,
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) return { error: "Falha interna (sem chave de idempotência). Atualize a página." };
  try {
    await registerPayment(sessionId, user.id, {
      paymentMethodId: String(formData.get("paymentMethodId") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      idempotencyKey,
      guestId: String(formData.get("guestId") ?? "") || undefined,
    });
  } catch (error) {
    if (error instanceof RegisterPaymentError) return { error: error.message };
    return { error: "Não foi possível registrar o pagamento." };
  }
  revalidateAtendimento(redirectPath);
  return { error: null, success: true };
}

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006) — a tela
// de seleção de consumo monta o carrinho no cliente (nada gravado ainda) e
// manda a lista de alocações como JSON num campo escondido, porque
// `useActionState`/FormData não carrega array aninhado. registerPayment
// revalida tudo contra o banco dentro da transação, o JSON do cliente é só
// "o que o operador pediu pra selecionar", nunca é confiado como valor
// final (regra 24).
export async function registerItemPaymentAction(
  redirectPath: string,
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) return { error: "Falha interna (sem chave de idempotência). Atualize a página." };

  let allocations: AllocationRequest[];
  try {
    allocations = JSON.parse(String(formData.get("allocationsJson") ?? "[]"));
  } catch {
    return { error: "Falha interna ao ler os itens selecionados. Atualize a página e tente de novo." };
  }

  try {
    await registerPayment(sessionId, user.id, {
      paymentMethodId: String(formData.get("paymentMethodId") ?? ""),
      idempotencyKey,
      guestId: String(formData.get("guestId") ?? "") || undefined,
      allocations,
    });
  } catch (error) {
    if (error instanceof RegisterPaymentError) return { error: error.message };
    return { error: "Não foi possível registrar o pagamento." };
  }
  revalidateAtendimento(redirectPath);
  revalidatePath(`${redirectPath}/pagamentos/novo`);
  return { error: null, success: true };
}

// "Dividir item" / "Redistribuir" (ADR 0006) — parts vazio ou "0" remove a
// divisão (item volta a ser normal). Mesma permissão de quem registra
// pagamento, é parte do mesmo fluxo de caixa.
export async function setItemShareAction(
  redirectPath: string,
  orderItemId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const raw = String(formData.get("parts") ?? "").trim();
  const parts = raw === "" || raw === "0" ? null : Number(raw);
  try {
    await setOrderItemShareParts(orderItemId, user.id, parts);
  } catch (error) {
    if (error instanceof SetOrderItemShareError) return { error: error.message };
    return { error: "Não foi possível dividir o item." };
  }
  revalidateAtendimento(redirectPath);
  revalidatePath(`${redirectPath}/pagamentos/novo`);
  return { error: null, success: true };
}

export async function voidPaymentAction(
  redirectPath: string,
  paymentId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  try {
    await voidPayment(paymentId, user.id, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof RegisterPaymentError) return { error: error.message };
    return { error: "Não foi possível estornar o pagamento." };
  }
  revalidateAtendimento(redirectPath);
  return { error: null, success: true };
}

export async function closeTableAction(redirectPath: string, sessionId: string) {
  const user = await requirePermission(PERMISSIONS.TABLES_CLOSE);
  try {
    await closeTable(sessionId, user.id);
  } catch (error) {
    if (error instanceof CloseTableError) throw error;
    throw new Error("Não foi possível finalizar o atendimento.");
  }
  revalidatePath(redirectPath);
  // Lista geral — `/mesas` para atendimento de mesa, `/retiradas` para
  // retirada (módulo Retiradas, 2026-08-14): derivada do redirectPath
  // (primeiro segmento), não precisa de um parâmetro a mais.
  const listPath = "/" + redirectPath.split("/")[1];
  revalidatePath(listPath);
  redirect(listPath);
}
