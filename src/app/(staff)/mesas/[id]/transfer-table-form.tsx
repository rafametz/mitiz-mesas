"use client";

import { useActionState } from "react";
import { SelectField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { transferTableAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

export function TransferTableForm({
  tableId,
  sessionId,
  freeTables,
}: {
  tableId: string;
  sessionId: string;
  freeTables: { id: string; number: string }[];
}) {
  const action = transferTableAction.bind(null, tableId, sessionId);
  const [state, formAction] = useActionState(action, initialState);

  if (freeTables.length === 0) {
    return <p className="text-sm text-muted">Nenhuma mesa livre no momento.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <SelectField label="Mesa de destino" name="destinationTableId" required defaultValue="">
        <option value="" disabled>
          Selecione
        </option>
        {freeTables.map((table) => (
          <option key={table.id} value={table.id}>
            {table.number}
          </option>
        ))}
      </SelectField>
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Trocando...">
        Trocar de mesa
      </SubmitButton>
    </form>
  );
}
