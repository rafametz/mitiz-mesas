"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";

// Preço como string (não number) até virar o Decimal do Prisma — evita
// qualquer arredondamento de ponto flutuante no caminho (regra 20/21 do
// CLAUDE.md). O próprio Decimal do Prisma valida a precisão no banco.
const priceRegex = /^\d+(\.\d{1,2})?$/;

const productSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  price: z.string().trim().regex(priceRegex, "Preço inválido, use até 2 casas decimais"),
  categoryId: z.string().min(1, "Categoria é obrigatória"),
  defaultSectorId: z.string().min(1, "Setor é obrigatório"),
  available: z.boolean(),
  active: z.boolean(),
});

function parseProductForm(formData: FormData) {
  return productSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    categoryId: formData.get("categoryId"),
    defaultSectorId: formData.get("defaultSectorId"),
    available: formData.get("available") === "on",
    active: formData.get("active") === "on",
  });
}

function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

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

  let data: ReturnType<typeof parseProductForm>;
  try {
    data = parseProductForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  const restaurant = await getCurrentRestaurant();
  await prisma.product.create({ data: { ...data, restaurantId: restaurant.id } });

  revalidatePath("/admin/produtos");
  return { error: null, success: true };
}

export async function updateProduct(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ReturnType<typeof parseProductForm>;
  try {
    data = parseProductForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  await prisma.product.update({ where: { id }, data });

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
