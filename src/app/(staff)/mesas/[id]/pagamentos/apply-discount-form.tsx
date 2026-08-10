"use client";

import { useActionState, useEffect, useRef } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { applyDiscountAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function ApplyDiscountForm({ tableId, sessionId }: { tableId: string; sessionId: string }) {
  const { showToast } = useToast();
  const action = applyDiscountAction.bind(null, tableId, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Desconto aplicado.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <SelectField label="Tipo" name="type" defaultValue="PERCENTAGE">
        <option value="PERCENTAGE">Percentual (%)</option>
        <option value="FIXED_AMOUNT">Valor fixo (R$)</option>
      </SelectField>
      <TextField
        label="Valor"
        name="value"
        inputMode="decimal"
        placeholder="0.00"
        required
      />
      <TextAreaField
        label="Motivo"
        name="reason"
        required
        minLength={3}
        maxLength={300}
        placeholder="Ex.: cliente fidelidade"
      />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Aplicando...">
        Aplicar desconto
      </SubmitButton>
    </form>
  );
}
