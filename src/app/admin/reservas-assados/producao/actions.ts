"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { isValidDateKey } from "@/domain/roast/production";
import { manageProductionDay, ManageProductionDayError } from "@/application/roast/manage-production-day";

export type FormState = { error: string | null; success?: boolean };

// Abre a tela de um dia de produção — cria o RoastProductionDay na hora se
// ainda não existir (sem quantidade planejada nenhuma ainda, o
// Administrador configura na tela seguinte). Redireciona direto, sem
// FormState: só é chamada por um <form> simples de "ano/mês/dia".
export async function openProductionDay(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const date = String(formData.get("date") ?? "");
  if (!isValidDateKey(date)) {
    throw new Error("Data inválida.");
  }

  const restaurant = await getCurrentRestaurant();
  const day = await prisma.roastProductionDay.upsert({
    where: { restaurantId_date: { restaurantId: restaurant.id, date } },
    update: {},
    create: { restaurantId: restaurant.id, date },
  });

  revalidatePath("/admin/reservas-assados/producao");
  redirect(`/admin/reservas-assados/producao/${day.id}`);
}

const quantitiesSchema = z.record(z.string(), z.string());

export async function saveProductionDayAction(
  productionDayId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const restaurant = await getCurrentRestaurant();

  const day = await prisma.roastProductionDay.findUniqueOrThrow({
    where: { id: productionDayId },
  });

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
      date: day.date,
      notes: String(formData.get("notes") ?? ""),
      quantities,
    });
  } catch (error) {
    if (error instanceof ManageProductionDayError) return { error: error.message };
    console.error("[admin/reservas-assados] falha ao salvar produção do dia:", error);
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath("/admin/reservas-assados/producao");
  revalidatePath(`/admin/reservas-assados/producao/${productionDayId}`);
  return { error: null, success: true };
}
