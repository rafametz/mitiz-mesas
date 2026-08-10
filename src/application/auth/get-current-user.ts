import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  hasAnyPermission,
  hasPermission,
  type PermissionCode,
  type RoleCode,
} from "@/domain/auth/permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  restaurantId: string;
  role: { code: RoleCode; label: string };
  permissions: PermissionCode[];
};

// Resolve o usuário da aplicação a partir da sessão Supabase atual.
// null cobre dois casos, de propósito não diferenciados aqui (quem chama
// decide o que fazer — normalmente mandar para /login de qualquer forma):
//   1. Ninguém autenticado no Supabase;
//   2. Autenticado no Supabase, mas sem `User` correspondente na aplicação
//      (conta ainda não provisionada por um administrador — CLAUDE.md
//      seção 5, cadastro de usuário é ação do admin, não auto-cadastro).
//
// cache() do React deduplica dentro da mesma requisição — sem isso, um
// layout e a página da aba ativa (ex.: mesas/[id]/layout.tsx +
// pedidos/page.tsx, ambos chamando requireUser()) repetiam a ida e volta
// de rede ao Supabase Auth + a consulta de User/Role/Permission duas
// vezes seguidas pro mesmo dado (docs/performance/audit.md, achado #1).
// Não muda nenhuma regra — só evita perguntar a mesma coisa de novo.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const appUser = await prisma.user.findUnique({
    where: { authUserId: authUser.id, active: true },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  if (!appUser) return null;

  return {
    id: appUser.id,
    name: appUser.name,
    email: appUser.email,
    restaurantId: appUser.restaurantId,
    role: { code: appUser.role.name as RoleCode, label: appUser.role.label },
    permissions: appUser.role.permissions.map((rp) => rp.permission.code as PermissionCode),
  };
});

// Para Server Components/páginas: garante usuário autenticado e provisionado
// ou redireciona para /login. O middleware (src/middleware.ts) já cobre o
// caso "sem sessão" antes da página renderizar; isto cobre também o caso
// "sessão válida, mas sem User provisionado".
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// Para Server Components e Server Actions que exigem uma permissão
// específica (CLAUDE.md regra 25 — permissão sempre verificada no
// backend, nunca só escondendo botão no frontend). Redireciona para uma
// página de "sem permissão" em vez de expor erro técnico.
export async function requirePermission(code: PermissionCode): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, code)) {
    redirect("/sem-permissao");
  }
  return user;
}

// Mesma ideia, pra ações que mais de um perfil pode fazer por caminhos
// diferentes (ex.: solicitar fechamento — Garçom com TABLES_CLOSE_REQUEST
// ou Caixa/Admin com TABLES_CLOSE direto, Módulo 8).
export async function requireAnyPermission(codes: PermissionCode[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasAnyPermission(user.permissions, codes)) {
    redirect("/sem-permissao");
  }
  return user;
}
