"use client";

import { useActionState, useState } from "react";
import { SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Input } from "@/components/ui/input";
import { openTableAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function OpenTableForm({
  tableId,
  waiters,
  currentUserId,
}: {
  tableId: string;
  waiters: { id: string; name: string }[];
  currentUserId: string;
}) {
  const action = openTableAction.bind(null, tableId);
  const [state, formAction] = useActionState(action, initialState);
  const [guestNameCount, setGuestNameCount] = useState(0);
  const isCurrentUserWaiter = waiters.some((w) => w.id === currentUserId);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4 pb-4">
      <h2 className="font-display text-lg font-semibold text-ink">Abrir mesa</h2>

      <TextField
        label="Quantidade de pessoas"
        name="guestCount"
        type="number"
        min={1}
        defaultValue={1}
        required
      />
      <TextField label="Responsável (opcional)" name="responsibleName" maxLength={120} />
      <SelectField
        label="Garçom responsável"
        name="waiterId"
        required
        defaultValue={isCurrentUserWaiter ? currentUserId : ""}
      >
        {!isCurrentUserWaiter && (
          <option value="" disabled>
            Selecione
          </option>
        )}
        {waiters.map((waiter) => (
          <option key={waiter.id} value={waiter.id}>
            {waiter.name}
          </option>
        ))}
      </SelectField>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">Nomes das pessoas (opcional)</span>
        {Array.from({ length: guestNameCount }).map((_, index) => (
          <label key={index} className="flex flex-col gap-1.5">
            <span className="sr-only">{`Nome da pessoa ${index + 1}`}</span>
            <Input name="guestName" placeholder={`Pessoa ${index + 1}`} maxLength={80} />
          </label>
        ))}
        <button
          type="button"
          onClick={() => setGuestNameCount((n) => n + 1)}
          className="self-start text-sm font-medium text-wine"
        >
          + adicionar nome
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton>Abrir mesa</SubmitButton>
    </form>
  );
}
