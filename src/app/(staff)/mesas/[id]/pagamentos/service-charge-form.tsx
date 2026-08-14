"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckboxField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { applyServiceChargeAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

// Cada envio só cria um ServiceCharge novo (nunca apaga o anterior — regra
// 8/17), então "aplicar de novo" e "trocar o percentual" são a mesma ação;
// não existe botão de anular separado como em Discount.
export function ServiceChargeForm({
  redirectPath,
  sessionId,
  defaultPercent,
}: {
  redirectPath: string;
  sessionId: string;
  defaultPercent: string;
}) {
  const { showToast } = useToast();
  const action = applyServiceChargeAction.bind(null, redirectPath, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [waived, setWaived] = useState(false);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast(waived ? "Taxa de serviço retirada." : "Taxa de serviço aplicada.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField
        label="Percentual (%)"
        name="percent"
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="0.01"
        defaultValue={defaultPercent}
        disabled={waived}
        required={!waived}
      />
      <CheckboxField
        label="Cliente pediu para retirar a taxa"
        name="waived"
        checked={waived}
        onChange={(e) => setWaived(e.target.checked)}
      />
      {waived && (
        <TextAreaField
          label="Motivo da retirada"
          name="waivedReason"
          required
          maxLength={300}
          placeholder="Ex.: cliente reclamou do atendimento"
        />
      )}
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Aplicando...">
        {waived ? "Retirar taxa" : "Aplicar taxa"}
      </SubmitButton>
    </form>
  );
}
