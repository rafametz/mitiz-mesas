"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { createModifierGroup, type FormState } from "../../modifiers-actions";

const initialState: FormState = { error: null };

export function NewGroupForm({ productId }: { productId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = createModifierGroup.bind(null, productId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Mesmo padrão de novo-produto/mesas — a ação não redireciona no
  // servidor, o componente cliente confirma e volta pra edição do produto
  // assim que vê `success: true`.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Grupo criado.");
      router.push(`/admin/produtos/${productId}/editar`);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <TextField
        label="Nome do grupo"
        name="name"
        required
        maxLength={80}
        placeholder="Ex.: Ponto da carne"
      />
      <TextField
        label="Mínimo de seleções"
        name="minSelect"
        type="number"
        min={0}
        defaultValue={0}
      />
      <TextField
        label="Máximo de seleções"
        name="maxSelect"
        type="number"
        min={1}
        defaultValue={1}
      />
      <CheckboxField label="Obrigatório" name="required" />
      <CheckboxField label="Ativo" name="active" defaultChecked />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Criando...">Criar grupo</SubmitButton>
    </form>
  );
}
