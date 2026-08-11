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
} from "@/application/service-session/register-payment";
import { closeTable, CloseTableError } from "@/application/service-session/close-table";

export type FormState = { error: string | null; success?: boolean };

function revalidateMesa(tableId: string) {
  revalidatePath(`/mesas/${tableId}`);
  revalidatePath(`/mesas/${tableId}/pagamentos`);
}

export async function requestClosingAction(tableId: string, sessionId: string) {
  const user = await requireAnyPermission([PERMISSIONS.TABLES_CLOSE_REQUEST, PERMISSIONS.TABLES_CLOSE]);
  try {
    await requestClosing(sessionId, user.id);
  } catch (error) {
    if (error instanceof RequestClosingError) throw error;
    throw new Error("Não foi possível solicitar o fechamento.");
  }
  revalidateMesa(tableId);
  redirect(`/mesas/${tableId}/pagamentos`);
}

// Volta CLOSING -> OPEN (revisão 2026-08-10) — "pedi a conta por engano"
// ou o cliente quer pedir mais alguma coisa. Mesma permissão de quem pode
// solicitar o fechamento.
export async function cancelClosingRequestAction(tableId: string, sessionId: string) {
  const user = await requireAnyPermission([PERMISSIONS.TABLES_CLOSE_REQUEST, PERMISSIONS.TABLES_CLOSE]);
  try {
    await cancelClosingRequest(sessionId, user.id);
  } catch (error) {
    if (error instanceof CancelClosingRequestError) throw error;
    throw new Error("Não foi possível cancelar a solicitação de fechamento.");
  }
  revalidateMesa(tableId);
  redirect(`/mesas/${tableId}`);
}

export async function applyDiscountAction(
  tableId: string,
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
  revalidateMesa(tableId);
  return { error: null, success: true };
}

export async function voidDiscountAction(
  tableId: string,
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
  revalidateMesa(tableId);
  return { error: null, success: true };
}

export async function applyServiceChargeAction(
  tableId: string,
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
  revalidateMesa(tableId);
  return { error: null, success: true };
}

export async function registerPaymentAction(
  tableId: string,
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) return { error: "Falha interna (sem chave de idempotência) — atualize a página." };
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
  revalidateMesa(tableId);
  return { error: null, success: true };
}

export async function voidPaymentAction(
  tableId: string,
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
  revalidateMesa(tableId);
  return { error: null, success: true };
}

export async function closeTableAction(tableId: string, sessionId: string) {
  const user = await requirePermission(PERMISSIONS.TABLES_CLOSE);
  try {
    await closeTable(sessionId, user.id);
  } catch (error) {
    if (error instanceof CloseTableError) throw error;
    throw new Error("Não foi possível finalizar o atendimento.");
  }
  revalidatePath(`/mesas/${tableId}`);
  revalidatePath("/mesas");
  redirect("/mesas");
}
