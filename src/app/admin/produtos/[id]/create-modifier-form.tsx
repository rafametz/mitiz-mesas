"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { TextField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { createModifier, type FormState } from "./modifiers-actions";

const initialState: FormState = { error: null };

// Antes esse formulário postava direto pro server action sem confirmação
// nenhuma na tela (nem toast, nem limpar os campos) — a única pista de que
// funcionou era a nova linha aparecendo na tabela acima, fácil de não
// perceber (relatado pelo usuário como "salvei e não deu certo", mas o
// adicional tinha sido criado). Agora confirma com toast e limpa o
// formulário pro próximo adicional (troca a `key`, que remonta o
// MoneyField com estado zerado — ele não é resetável via form.reset()
// porque guarda os dígitos em estado próprio, não só no DOM).
export function CreateModifierForm({ groupId }: { groupId: string }) {
  const { showToast } = useToast();
  const action = createModifier.bind(null, groupId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [formKey, setFormKey] = useState(0);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Adicional criado.");
      setFormKey((key) => key + 1);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form key={formKey} action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <TextField label="Novo adicional" name="name" required maxLength={80} className="w-40" />
      <MoneyField label="Valor" name="priceDelta" allowNegative className="w-40" />
      <SubmitButton pendingLabel="Adicionando...">Adicionar</SubmitButton>
      {state.error && (
        <p role="alert" className="w-full text-sm text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
