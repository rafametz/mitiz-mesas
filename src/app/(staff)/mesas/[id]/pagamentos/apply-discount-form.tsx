"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { DiscountType } from "@prisma/client";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { applyDiscountAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function ApplyDiscountForm({ tableId, sessionId }: { tableId: string; sessionId: string }) {
  const { showToast } = useToast();
  const action = applyDiscountAction.bind(null, tableId, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [type, setType] = useState<DiscountType>("PERCENTAGE");

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
      <SelectField
        label="Tipo"
        name="type"
        value={type}
        onChange={(e) => setType(e.target.value as DiscountType)}
      >
        <option value="PERCENTAGE">Percentual (%)</option>
        <option value="FIXED_AMOUNT">Valor fixo (R$)</option>
      </SelectField>
      {/* "value" tem o mesmo name nos dois campos — só um está montado por
          vez (o tipo escolhido acima), então o FormData recebe exatamente
          um valor, no formato certo pra cada caso (percentual simples vs.
          o campo de dinheiro que formata em Real). */}
      {type === "PERCENTAGE" ? (
        <TextField
          label="Valor (%)"
          name="value"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.01"
          placeholder="0"
          required
        />
      ) : (
        <MoneyField label="Valor" name="value" />
      )}
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
