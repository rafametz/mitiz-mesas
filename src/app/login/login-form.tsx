"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { SubmitButton } from "@/components/form/submit-button";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

// Só o e-mail fica salvo (nunca a senha, em lugar nenhum — texto puro no
// client seria inseguro) — "Lembrar de mim" é conveniência de
// preenchimento, não sessão persistente nova (isso o Supabase já
// controla via cookie).
const REMEMBER_EMAIL_KEY = "mitiz.login.email";

const darkInputClass =
  "h-12 w-full rounded-control-sm border border-shell-line bg-white/5 text-sm text-bg placeholder:text-bg/30 outline-none transition-colors focus:border-gold";

// Mobile-first (CLAUDE.md seção 11): campos grandes o bastante para toque
// com uma mão, sem depender de hover, com feedback de carregamento e erro.
// Campos com estilo próprio (escuro, com ícone) em vez de reusar
// TextField — é o único formulário escuro do app, o resto do sistema é
// claro; forçar essa variante no componente compartilhado espalharia uma
// exceção pra tudo que usa TextField.
export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState);
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  // Só depois de montar (evita divergir do HTML renderizado no servidor).
  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  function handleSubmit(formData: FormData) {
    if (remember) {
      window.localStorage.setItem(REMEMBER_EMAIL_KEY, String(formData.get("email") ?? ""));
    } else {
      window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
    formAction(formData);
  }

  return (
    <form action={handleSubmit} className="mt-5 flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-sm font-medium text-bg/80">
          E-mail
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-bg/40" />
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className={`${darkInputClass} pl-10 pr-3`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={passwordId} className="text-sm font-medium text-bg/80">
          Senha
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-bg/40" />
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Sua senha"
            className={`${darkInputClass} pl-10 pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            title={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-bg/40 transition-colors hover:text-bg/70"
          >
            {showPassword ? (
              <EyeOff className="h-4.5 w-4.5" />
            ) : (
              <Eye className="h-4.5 w-4.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label htmlFor={rememberId} className="flex items-center gap-2 text-bg/70">
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4.5 w-4.5 rounded border-shell-line bg-white/5 accent-gold"
          />
          Lembrar de mim
        </label>
        <Link href="/login/esqueci-senha" className="font-medium text-gold hover:text-gold-light">
          Esqueci a senha
        </Link>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-wine-light">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Entrando..." className="h-12 gap-2">
        Entrar
        <ArrowRight className="h-4 w-4" />
      </SubmitButton>
    </form>
  );
}
