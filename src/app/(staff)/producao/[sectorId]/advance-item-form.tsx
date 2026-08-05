"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormState } from "./actions";

const initialState: FormState = { error: null };

// Um botão, sem campo — avança o item para o próximo status da esteira de
// produção (CLAUDE.md seção 5). Mesmo padrão de pending state/erro inline
// do CancelItemForm (Módulo 4), sem o campo de motivo (não se aplica aqui).
export function AdvanceItemForm({
  action,
  label,
  pendingLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-2">
      <SubmitButton pendingLabel={pendingLabel} className="w-full">
        {label}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="mt-1 text-xs text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
