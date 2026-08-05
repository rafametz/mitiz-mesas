"use client";

import { useActionState } from "react";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null };

// Mobile-first (CLAUDE.md seção 11): campos grandes o bastante para toque
// com uma mão, sem depender de hover, com feedback de carregamento e erro.
export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <TextField
        label="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="h-12"
      />
      <TextField
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="h-12"
      />

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Entrando...">
        <span className="block w-full">Entrar</span>
      </SubmitButton>
    </form>
  );
}
