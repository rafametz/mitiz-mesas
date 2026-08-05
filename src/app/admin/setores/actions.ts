"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";

const sectorSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  hasPrinting: z.boolean(),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
});

function parseSectorForm(formData: FormData) {
  return sectorSchema.parse({
    name: formData.get("name"),
    hasPrinting: formData.get("hasPrinting") === "on",
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

export async function createSector(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseSectorForm(formData);
  const restaurant = await getCurrentRestaurant();

  await prisma.productionSector.create({
    data: { ...data, restaurantId: restaurant.id },
  });

  revalidatePath("/admin/setores");
}

export async function updateSector(id: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseSectorForm(formData);

  await prisma.productionSector.update({ where: { id }, data });

  revalidatePath("/admin/setores");
}
