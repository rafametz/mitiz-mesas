"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";

const tableSchema = z.object({
  number: z.string().trim().min(1, "Número/nome é obrigatório").max(20),
  capacity: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.coerce.number().int().positive().optional(),
  ),
  status: z.nativeEnum(TableStatus),
});

function parseTableForm(formData: FormData) {
  return tableSchema.parse({
    number: formData.get("number"),
    capacity: formData.get("capacity"),
    status: formData.get("status"),
  });
}

export async function createTable(formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseTableForm(formData);
  const restaurant = await getCurrentRestaurant();

  await prisma.table.create({ data: { ...data, restaurantId: restaurant.id } });

  revalidatePath("/admin/mesas");
  redirect("/admin/mesas");
}

export async function updateTable(id: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseTableForm(formData);

  await prisma.table.update({ where: { id }, data });

  revalidatePath("/admin/mesas");
}
