"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormState } from "./actions";

const initialState: FormState = { error: null };

export function CancelItemForm({
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
    <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
      <input
        name="reason"
        placeholder="Motivo"
        required
        minLength={3}
        maxLength={300}
        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
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
