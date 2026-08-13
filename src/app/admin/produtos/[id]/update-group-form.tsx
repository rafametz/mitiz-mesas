"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { updateModifierGroup, type FormState } from "./modifiers-actions";

const initialState: FormState = { error: null };

// Antes esse formulário postava direto pro server action sem passar por
// useActionState — funcionava, mas não dava nenhum feedback visível de
// sucesso (só a revalidação silenciosa da página). Igual ao resto do app
// (NewGroupForm, NewProductForm): confirma com toast quando salva.
export function UpdateGroupForm({
  groupId,
  group,
}: {
  groupId: string;
  group: { name: string; minSelect: number; maxSelect: number; required: boolean; active: boolean };
}) {
  const { showToast } = useToast();
  const action = updateModifierGroup.bind(null, groupId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Grupo atualizado.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <TextField label="Grupo" name="name" defaultValue={group.name} required maxLength={80} />
      <TextField
        label="Mín."
        name="minSelect"
        type="number"
        min={0}
        defaultValue={group.minSelect}
        className="w-20"
      />
      <TextField
        label="Máx."
        name="maxSelect"
        type="number"
        min={1}
        defaultValue={group.maxSelect}
        className="w-20"
      />
      <CheckboxField label="Obrigatório" name="required" defaultChecked={group.required} />
      <CheckboxField label="Ativo" name="active" defaultChecked={group.active} />
      <SubmitButton pendingLabel="Salvando...">Salvar grupo</SubmitButton>
      {state.error && (
        <p role="alert" className="w-full text-sm text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
