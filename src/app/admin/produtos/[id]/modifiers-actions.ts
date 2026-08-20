"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";

// "Obrigatório" (correção 2026-08-19, relato do usuário: grupo marcado
// como não obrigatório mesmo assim bloqueava o pedido) deixou de ser um
// campo próprio no formulário — virava dois controles independentes
// (checkbox "Obrigatório" e campo "Mínimo de seleções") que podiam
// divergir sem nenhum aviso: um produto com "Obrigatório" desmarcado mas
// "Mínimo" = 1 continuava sendo bloqueado na hora de criar o pedido
// (create-order.ts valida por `minSelect`, não por `required`), sem
// nenhuma pista visível pro admin de que os dois campos tinham que
// concordar. `required` (a coluna continua existindo, só pra exibição —
// ex.: o "(obrigatório)" na tela de novo pedido) agora é sempre derivado
// de `minSelect > 0` no servidor, nunca mais lido direto do formulário —
// única fonte de verdade passa a ser o "Mínimo de seleções".
const groupSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").max(80),
    minSelect: z.coerce.number().int().min(0),
    maxSelect: z.coerce.number().int().min(1),
    sortOrder: z.coerce.number().int().default(0),
    active: z.boolean(),
  })
  .refine((data) => data.minSelect <= data.maxSelect, {
    message: "Mínimo não pode ser maior que o máximo",
    path: ["minSelect"],
  })
  .transform((data) => ({ ...data, required: data.minSelect > 0 }));

function parseGroupForm(formData: FormData) {
  return groupSchema.parse({
    name: formData.get("name"),
    minSelect: formData.get("minSelect") || 0,
    maxSelect: formData.get("maxSelect") || 1,
    sortOrder: formData.get("sortOrder") || 0,
    active: formData.get("active") === "on",
  });
}

function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

// `success` distingue "acabou de criar" do estado inicial — o formulário
// de novo grupo vive em página própria (/admin/produtos/[id]/grupos/novo) e
// volta pra edição do produto só depois de ver `success: true` (mesmo
// padrão de createProduct em ../actions.ts).
export type FormState = { error: string | null; success?: boolean };

export async function createModifierGroup(
  productId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ReturnType<typeof parseGroupForm>;
  try {
    data = parseGroupForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  await prisma.productModifierGroup.create({ data: { ...data, productId } });

  revalidatePath(`/admin/produtos/${productId}/editar`);
  return { error: null, success: true };
}

export async function updateModifierGroup(
  groupId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ReturnType<typeof parseGroupForm>;
  try {
    data = parseGroupForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  const group = await prisma.productModifierGroup.update({ where: { id: groupId }, data });

  revalidatePath(`/admin/produtos/${group.productId}/editar`);
  return { error: null, success: true };
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

export async function createModifier(
  groupId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ReturnType<typeof parseModifierForm>;
  try {
    data = parseModifierForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  // O formulário rápido de "novo adicional" não tem campo "Ativo" (fica só
  // na edição, para não poluir o form de criação) — sem isso, `active`
  // sempre viria `false` de parseModifierForm, deixando o adicional
  // recém-criado invisível para pedidos. Todo item novo nasce ativo.
  const created = await prisma.productModifier.create({ data: { ...data, active: true, groupId } });
  const parentGroup = await prisma.productModifierGroup.findUniqueOrThrow({
    where: { id: created.groupId },
  });

  revalidatePath(`/admin/produtos/${parentGroup.productId}/editar`);
  return { error: null, success: true };
}

export async function updateModifier(
  modifierId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: ReturnType<typeof parseModifierForm>;
  try {
    data = parseModifierForm(formData);
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    return { error: zodMessage ?? "Dados inválidos." };
  }

  const updated = await prisma.productModifier.update({ where: { id: modifierId }, data });
  const parentGroup = await prisma.productModifierGroup.findUniqueOrThrow({
    where: { id: updated.groupId },
  });

  revalidatePath(`/admin/produtos/${parentGroup.productId}/editar`);
  return { error: null, success: true };
}
