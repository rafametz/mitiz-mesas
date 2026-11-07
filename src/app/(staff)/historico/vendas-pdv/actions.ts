"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { reversePdvSale, ReversePdvSaleError } from "@/application/pdv/reverse-sale";

export type FormState = { error: string | null; success?: boolean };

// Mesma permissão que já vale hoje pra estornar um pagamento de mesa
// (PAYMENTS_REGISTER — Admin e Caixa, decisão do usuário 2026-11-08).
export async function reverseSaleAction(
  sessionId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);

  try {
    await reversePdvSale(sessionId, user.id, String(formData.get("reason") ?? ""));
  } catch (error) {
    if (error instanceof ReversePdvSaleError) return { error: error.message };
    console.error(`[vendas-pdv] falha ao estornar venda ${sessionId}:`, error);
    return { error: "Não foi possível estornar a venda. Tente de novo." };
  }

  revalidatePath("/historico/vendas-pdv");
  revalidatePath(`/historico/vendas-pdv/${sessionId}`);
  return { error: null, success: true };
}
