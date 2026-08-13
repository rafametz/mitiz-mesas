"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { wouldLeaveNoActiveAdmin } from "@/domain/auth/user-guard";

const nameSchema = z.string().trim().min(1, "Nome é obrigatório").max(120);
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail inválido");
// Senha temporária digitada pelo administrador na hora do cadastro — CLAUDE.md
// não define uma troca obrigatória no primeiro acesso (não existe essa tela
// ainda), então o mínimo aqui só evita senha claramente fraca demais.
const passwordSchema = z
  .string()
  .min(8, "Senha deve ter pelo menos 8 caracteres")
  .max(72, "Senha muito longa");

const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  roleId: z.string().min(1, "Perfil é obrigatório"),
  active: z.boolean(),
});

const updateUserSchema = z.object({
  name: nameSchema,
  roleId: z.string().min(1, "Perfil é obrigatório"),
  active: z.boolean(),
});

function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

export type FormState = { error: string | null; success?: boolean };

// Cadastro de usuário (Módulo de Administração de usuários, pedido do
// usuário 2026-08-13): cria o login de verdade (Supabase Auth, via service
// role — só rotina de servidor, nunca exposto ao navegador) junto com o
// perfil interno (User/Role). São dois sistemas diferentes sem transação
// compartilhada possível — se o registro interno falhar depois do login já
// ter sido criado, desfaz o login pra não sobrar conta órfã sem cadastro.
export async function createUser(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: z.infer<typeof createUserSchema>;
  try {
    data = createUserSchema.parse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      roleId: formData.get("roleId"),
      active: formData.get("active") === "on",
    });
  } catch (error) {
    return { error: firstZodMessage(error) ?? "Dados inválidos." };
  }

  const restaurant = await getCurrentRestaurant();

  const emailInUse = await prisma.user.findUnique({ where: { email: data.email } });
  if (emailInUse) {
    return { error: "Já existe um usuário com esse e-mail." };
  }

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) {
    return { error: "Perfil inválido." };
  }

  const serviceRole = createServiceRoleClient();
  const { data: authResult, error: authError } = await serviceRole.auth.admin.createUser({
    email: data.email,
    password: data.password,
    // Conta criada pelo administrador, não autocadastro — não precisa de
    // confirmação por e-mail, já entra pronta pra logar (CLAUDE.md seção 5:
    // cadastro de usuário é ação do admin).
    email_confirm: true,
    user_metadata: { name: data.name },
  });
  if (authError || !authResult?.user) {
    return { error: authError?.message ?? "Não foi possível criar o login do usuário." };
  }
  const authUserId = authResult.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          restaurantId: restaurant.id,
          roleId: data.roleId,
          name: data.name,
          email: data.email,
          authUserId,
          active: data.active,
        },
      });
      await writeAuditLog(tx, {
        restaurantId: restaurant.id,
        userId: currentUser.id,
        tableId: null,
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        metadata: { name: data.name, email: data.email, role: role.label, active: data.active },
      });
      return user;
    });
  } catch {
    // Registro interno falhou — desfaz o login recém-criado pra não deixar
    // uma conta Supabase Auth sem cadastro correspondente na aplicação.
    await serviceRole.auth.admin.deleteUser(authUserId).catch(() => {});
    return { error: "Não foi possível salvar o usuário. Tente novamente." };
  }

  revalidatePath("/admin/usuarios");
  return { error: null, success: true };
}

// Edição: nome, perfil e ativo/inativo — pedido do usuário
// ("dar/retirar permissões" = trocar o perfil; "controle dos usuários" =
// ativar/desativar). E-mail não é editável aqui: é a identidade da conta no
// Supabase Auth, mudar isso exigiria mexer nos dois sistemas juntos, fora do
// pedido original.
export async function updateUser(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let data: z.infer<typeof updateUserSchema>;
  try {
    data = updateUserSchema.parse({
      name: formData.get("name"),
      roleId: formData.get("roleId"),
      active: formData.get("active") === "on",
    });
  } catch (error) {
    return { error: firstZodMessage(error) ?? "Dados inválidos." };
  }

  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) {
    return { error: "Usuário não encontrado." };
  }

  const newRole = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!newRole) {
    return { error: "Perfil inválido." };
  }

  const isCurrentlyAdmin = target.role.name === "ADMIN";
  if (isCurrentlyAdmin) {
    const otherActiveAdminCount = await prisma.user.count({
      where: { id: { not: id }, active: true, role: { name: "ADMIN" } },
    });
    const blocked = wouldLeaveNoActiveAdmin({
      isCurrentlyAdmin,
      willBeAdmin: newRole.name === "ADMIN",
      willBeActive: data.active,
      otherActiveAdminCount,
    });
    if (blocked) {
      return {
        error:
          target.id === currentUser.id
            ? "Você não pode remover seu próprio acesso de administrador: precisa haver pelo menos um administrador ativo."
            : "Essa mudança deixaria o restaurante sem nenhum administrador ativo.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { name: data.name, roleId: data.roleId, active: data.active },
      });
      await writeAuditLog(tx, {
        restaurantId: target.restaurantId,
        userId: currentUser.id,
        tableId: null,
        action: "user.updated",
        entityType: "User",
        entityId: id,
        metadata: {
          name: data.name,
          role: newRole.label,
          active: data.active,
          previousRole: target.role.label,
          previousActive: target.active,
        },
      });
    });
  } catch {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${id}/editar`);
  return { error: null, success: true };
}

// Redefinir senha (pedido do usuário 2026-08-13, depois do Módulo 13):
// admin digita uma senha nova direto na tela, sem precisar do painel do
// Supabase. Só troca a senha no Supabase Auth — não mexe em nome/perfil/
// ativo, então não passa pelo guard de "último admin" (não afeta acesso).
// A senha em si nunca entra no log/auditoria (CLAUDE.md seção 14 — não
// registrar senha em log), só o fato de que foi redefinida.
export async function resetUserPassword(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const currentUser = await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let password: string;
  try {
    password = passwordSchema.parse(formData.get("password"));
  } catch (error) {
    return { error: firstZodMessage(error) ?? "Senha inválida." };
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return { error: "Usuário não encontrado." };
  }

  const serviceRole = createServiceRoleClient();
  const { error: authError } = await serviceRole.auth.admin.updateUserById(target.authUserId, {
    password,
  });
  if (authError) {
    return { error: authError.message || "Não foi possível redefinir a senha." };
  }

  try {
    await prisma.$transaction((tx) =>
      writeAuditLog(tx, {
        restaurantId: target.restaurantId,
        userId: currentUser.id,
        tableId: null,
        action: "user.password_reset",
        entityType: "User",
        entityId: id,
        metadata: { name: target.name, email: target.email },
      }),
    );
  } catch {
    // A senha já foi trocada de verdade no Supabase Auth (não dá pra
    // desfazer isso com segurança) — só a auditoria falhou. Avisa mesmo
    // assim como sucesso, já que o efeito pedido (senha nova) aconteceu.
  }

  return { error: null, success: true };
}
