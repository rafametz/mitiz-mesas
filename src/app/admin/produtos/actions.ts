"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { prisma } from "@/lib/prisma";
import {
  firstZodMessage,
  parseProductFormData,
  uniqueConstraintMessage,
  type ProductFormData,
} from "@/domain/product/product-form";

// `success` distingue "acabou de salvar" do estado inicial — os formulários
// de produto vivem em página própria e navegam de volta pra listagem só
// depois de ver `success: true` (mesmo padrão de createOrderAction em
// mesas/[id]/pedidos/actions.ts).
export type FormState = { error: string | null; success?: boolean };

export async function createProduct(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ProductFormData;
  try {
    data = parseProductFormData(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  const restaurant = await getCurrentRestaurant();
  try {
    await prisma.product.create({ data: { ...data, restaurantId: restaurant.id } });
  } catch (error) {
    const message = uniqueConstraintMessage(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath("/admin/produtos");
  return { error: null, success: true };
}

export async function updateProduct(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ProductFormData;
  try {
    data = parseProductFormData(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  try {
    await prisma.product.update({ where: { id }, data });
  } catch (error) {
    const message = uniqueConstraintMessage(error);
    if (message) return { error: message };
    throw error;
  }

  revalidatePath("/admin/produtos");
  return { error: null, success: true };
}

// Ação rápida para a listagem: só liga/desliga disponibilidade, sem abrir
// o formulário de edição completo (CLAUDE.md seção 4 — disponibilidade de
// produto é uma ação frequente do dia a dia).
export async function toggleAvailability(id: string, available: boolean) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  await prisma.product.update({ where: { id }, data: { available } });
  revalidatePath("/admin/produtos");
}
