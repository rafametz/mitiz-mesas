"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { manageProductionDay, ManageProductionDayError } from "@/application/roast/manage-production-day";

export type FormState = { error: string | null; success?: boolean };

const quantitiesSchema = z.record(z.string(), z.string());

// Só domingo (pedido do usuário 2026-10-04, mesma regra da tela de
// reservas do garçom — evita configurar produção num dia que nunca vai
// virar reserva) — quem chama já resolveu `date` sempre para um domingo
// (page.tsx usa `nextSundayFrom`). `manageProductionDay` faz upsert do
// RoastProductionDay por (restaurantId, date): não precisa mais existir
// antes de salvar, cria na hora se for a primeira vez que este domingo é
// configurado.
export async function saveProductionDayAction(
  date: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const restaurant = await getCurrentRestaurant();

  let quantitiesRaw: Record<string, string>;
  try {
    quantitiesRaw = quantitiesSchema.parse(JSON.parse(String(formData.get("quantitiesJson") ?? "{}")));
  } catch {
    return { error: "Dados inválidos. Atualize a página e tente de novo." };
  }

  const quantities = Object.entries(quantitiesRaw).map(([roastProductId, plannedQuantity]) => ({
    roastProductId,
    plannedQuantity: plannedQuantity === "" ? 0 : Number(plannedQuantity),
  }));

  try {
    await manageProductionDay({
      restaurantId: restaurant.id,
      date,
      notes: String(formData.get("notes") ?? ""),
      quantities,
    });
  } catch (error) {
    if (error instanceof ManageProductionDayError) return { error: error.message };
    console.error("[admin/reservas-assados] falha ao salvar produção do dia:", error);
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath("/admin/reservas-assados/producao");
  return { error: null, success: true };
}
