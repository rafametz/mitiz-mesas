"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "./actions";

const initialState: FormState = { error: null };

export function CancelItemForm({
  action,
  label,
  pendingLabel,
  successMessage,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pendingLabel: string;
  successMessage: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const reasonId = useId();
  const { showToast } = useToast();
  // Detecta a transição pending -> settled sem erro (envio de verdade que
  // terminou bem) — o estado inicial também é `{error: null}`, então
  // checar só `!state.error` disparava toast já na montagem.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) showToast(successMessage);
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.error]);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
      <label htmlFor={reasonId} className="sr-only">
        Motivo do cancelamento
      </label>
      <Input
        id={reasonId}
        name="reason"
        placeholder="Motivo"
        required
        minLength={3}
        maxLength={300}
        className="h-9 min-w-0 flex-1"
      />
      <SubmitButton pendingLabel={pendingLabel} variant="danger" className="h-9">
        {label}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="w-full text-xs text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
