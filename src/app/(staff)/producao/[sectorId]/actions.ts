"use server";

import { revalidatePath } from "next/cache";
import type { OrderItemStatus } from "@prisma/client";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { updateOrderItemStatus, UpdateItemStatusError } from "@/application/production/update-item-status";

export type FormState = { error: string | null };

// Sem campo de formulário — os três primeiros argumentos vêm do bind() no
// card (item/setor/próximo status); useActionState sempre chama a função
// com (state, formData) por cima disso, mas nenhum dos dois é necessário
// aqui, então nem são declarados (uma function type aceita ser chamada com
// mais argumentos do que declara).
export async function advanceItemStatusAction(
  itemId: string,
  sectorId: string,
  toStatus: OrderItemStatus,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.PRODUCTION_STATUS_UPDATE);

  try {
    await updateOrderItemStatus(itemId, toStatus);
  } catch (error) {
    if (error instanceof UpdateItemStatusError) return { error: error.message };
    return { error: "Não foi possível atualizar o item. Tente de novo." };
  }

  revalidatePath(`/producao/${sectorId}`);
  return { error: null };
}
