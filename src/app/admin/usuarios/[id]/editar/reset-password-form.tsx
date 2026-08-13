"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { resetUserPassword, type FormState } from "../../actions";

const initialState: FormState = { error: null };

// Seção separada do form de nome/perfil/ativo de propósito: é uma ação
// diferente (só mexe na senha no Supabase Auth, não tem guard de "último
// admin" porque não afeta acesso/perfil) — pedido do usuário 2026-08-13,
// depois de perguntar "como resetar a senha de um usuário criado".
export function ResetPasswordForm({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const action = resetUserPassword.bind(null, userId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [formKey, setFormKey] = useState(0);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Senha redefinida.");
      setFormKey((key) => key + 1); // limpa o campo depois de trocar
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">Redefinir senha</h2>
        <p className="text-sm text-muted">
          Define uma senha nova pra essa pessoa. Combine a senha com ela antes de entregar o
          acesso.
        </p>
      </div>
      <form key={formKey} action={formAction} className="flex flex-col gap-4">
        <TextField
          label="Senha nova"
          name="password"
          type="password"
          required
          minLength={8}
          hint="Pelo menos 8 caracteres."
        />
        {state.error && (
          <p role="alert" className="text-sm text-wine">
            {state.error}
          </p>
        )}
        <SubmitButton variant="secondary" pendingLabel="Redefinindo...">
          Redefinir senha
        </SubmitButton>
      </form>
    </Card>
  );
}
