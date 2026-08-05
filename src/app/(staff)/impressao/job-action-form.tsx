"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import type { FormState } from "./actions";

const initialState: FormState = { error: null };

export function JobActionForm({
  action,
  label,
  pendingLabel,
  variant = "outline",
}: {
  action: (prevState: FormState) => Promise<FormState>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "outline" | "danger";
}) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <SubmitButton variant={variant} pendingLabel={pendingLabel} className="h-8 px-3 text-xs">
        {label}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
