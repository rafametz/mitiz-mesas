"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { getPostLoginPath } from "@/domain/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null };

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Mensagem genérica de propósito — não revela se o e-mail existe ou não.
    return { error: "E-mail ou senha inválidos." };
  }

  // Cada perfil cai direto na sua tela principal, sem passar pela tela
  // "Conta" — admin no painel de mesas, garçom/caixa no grid de mesas do
  // app, produção na fila (ver getPostLoginPath). Se o Supabase autenticou
  // mas ainda não existe User provisionado na aplicação (conta criada só
  // no Supabase, sem vínculo — CLAUDE.md seção 5, cadastro é ação do
  // admin), cai em "/" como antes; requireUser() trata esse caso lá.
  const user = await getCurrentUser();
  redirect(user ? getPostLoginPath(user.role.code) : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
