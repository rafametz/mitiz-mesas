"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";

const groupSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").max(80),
    required: z.boolean(),
    minSelect: z.coerce.number().int().min(0),
    maxSelect: z.coerce.number().int().min(1),
    sortOrder: z.coerce.number().int().default(0),
    active: z.boolean(),
  })
  .refine((data) => data.minSelect <= data.maxSelect, {
    message: "Mínimo não pode ser maior que o máximo",
    path: ["minSelect"],
  });

function parseGroupForm(formData: FormData) {
  return groupSchema.parse({
    name: formData.get("name"),
    required: formData.get("required") === "on",
    minSelect: formData.get("minSelect") || 0,
    maxSelect: formData.get("maxSelect") || 1,
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

export async function createModifierGroup(productId: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseGroupForm(formData);

  await prisma.productModifierGroup.create({ data: { ...data, productId } });

  revalidatePath(`/admin/produtos/${productId}/editar`);
}

export async function updateModifierGroup(groupId: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseGroupForm(formData);

  const group = await prisma.productModifierGroup.update({ where: { id: groupId }, data });

  revalidatePath(`/admin/produtos/${group.productId}/editar`);
}

const modifierSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(80),
  priceDelta: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d{1,2})?$/, "Valor inválido"),
  sortOrder: z.coerce.number().int().default(0),
  active: z.boolean(),
});

function parseModifierForm(formData: FormData) {
  return modifierSchema.parse({
    name: formData.get("name"),
    priceDelta: formData.get("priceDelta") || "0",
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

export async function createModifier(groupId: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseModifierForm(formData);
  // O formulário rápido de "novo adicional" não tem campo "Ativo" (fica só
  // na edição, para não poluir o form de criação) — sem isso, `active`
  // sempre viria `false` de parseModifierForm, deixando o adicional
  // recém-criado invisível para pedidos. Todo item novo nasce ativo.
  const created = await prisma.productModifier.create({ data: { ...data, active: true, groupId } });
  const parentGroup = await prisma.productModifierGroup.findUniqueOrThrow({
    where: { id: created.groupId },
  });

  revalidatePath(`/admin/produtos/${parentGroup.productId}/editar`);
}

export async function updateModifier(modifierId: string, formData: FormData) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const data = parseModifierForm(formData);

  const updated = await prisma.productModifier.update({ where: { id: modifierId }, data });
  const parentGroup = await prisma.productModifierGroup.findUniqueOrThrow({
    where: { id: updated.groupId },
  });

  revalidatePath(`/admin/produtos/${parentGroup.productId}/editar`);
}
