"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { sellPdv, SellPdvError } from "@/application/service-session/sell-pdv";

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
