"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
});

function parseCategoryForm(formData: FormData) {
  return categorySchema.parse({
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

export async function createCategory(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseCategoryForm(formData);
  const restaurant = await getCurrentRestaurant();

  await prisma.category.create({ data: { ...data, restaurantId: restaurant.id } });

  revalidatePath("/admin/categorias");
}

export async function updateCategory(id: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseCategoryForm(formData);

  await prisma.category.update({ where: { id }, data });

  revalidatePath("/admin/categorias");
}
