"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";

const roastProductSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  unit: z.string().trim().min(1, "Unidade é obrigatória").max(20),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
});

function parseRoastProductForm(formData: FormData) {
  return roastProductSchema.parse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

export async function createRoastProduct(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseRoastProductForm(formData);
  const restaurant = await getCurrentRestaurant();

  await prisma.roastProduct.create({ data: { ...data, restaurantId: restaurant.id } });

  revalidatePath("/admin/reservas-assados");
}

export async function updateRoastProduct(id: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseRoastProductForm(formData);

  await prisma.roastProduct.update({ where: { id }, data });

  revalidatePath("/admin/reservas-assados");
}
