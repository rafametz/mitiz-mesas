"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckboxField, TextField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { SubmitButton } from "@/components/form/submit-button";
import { formatBRL } from "@/lib/money";
import { useToast } from "@/components/ui/toast";
import { updateModifier, type FormState } from "./modifiers-actions";

const initialState: FormState = { error: null };

// Mesmo motivo do UpdateGroupForm/CreateModifierForm: confirmação visível
// depois de salvar, em vez de só a revalidação silenciosa da tabela.
export function UpdateModifierForm({
  modifierId,
  modifier,
}: {
  modifierId: string;
  modifier: { name: string; priceDelta: string; active: boolean };
}) {
  const { showToast } = useToast();
  const action = updateModifier.bind(null, modifierId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Adicional atualizado.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <TextField
        label="Nome"
        name="name"
        defaultValue={modifier.name}
        required
        maxLength={80}
        className="w-40"
      />
      <MoneyField
        label="Valor"
        name="priceDelta"
        defaultValue={modifier.priceDelta}
        allowNegative
        className="w-40"
      />
      <CheckboxField label="Ativo" name="active" defaultChecked={modifier.active} />
      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
      <span className="tabular text-xs text-muted">atual: {formatBRL(modifier.priceDelta)}</span>
      {state.error && (
        <p role="alert" className="w-full text-sm text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
