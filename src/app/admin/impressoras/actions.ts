"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { generatePrinterToken, hashPrinterToken } from "@/lib/printing/token";

const printerSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  connectionInfo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  active: z.boolean(),
});

function parsePrinterForm(formData: FormData) {
  return printerSchema.parse({
    name: formData.get("name"),
    connectionInfo: formData.get("connectionInfo"),
    active: formData.get("active") === "on",
  });
}

export async function createPrinter(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parsePrinterForm(formData);
  const restaurant = await getCurrentRestaurant();

  await prisma.printer.create({ data: { ...data, restaurantId: restaurant.id } });

  revalidatePath("/admin/impressoras");
}

export async function updatePrinter(id: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parsePrinterForm(formData);

  await prisma.printer.update({ where: { id }, data });

  revalidatePath("/admin/impressoras");
  revalidatePath(`/admin/impressoras/${id}/editar`);
}

export type RegenerateTokenState = { token: string | null; error: string | null };

// Gera um token novo e mostra em texto puro só desta vez — só o hash fica
// gravado (docs/printing/architecture.md). Gerar de novo invalida o token
// anterior na hora (o agente que estiver usando o antigo passa a receber
// 401 no próximo polling).
export async function regeneratePrinterTokenAction(
  printerId: string,
): Promise<RegenerateTokenState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  const token = generatePrinterToken();
  await prisma.printer.update({
    where: { id: printerId },
    data: { agentTokenHash: hashPrinterToken(token) },
  });

  revalidatePath(`/admin/impressoras/${printerId}/editar`);
  return { token, error: null };
}
