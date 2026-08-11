"use client";

import { useActionState } from "react";
import { markGuestSettledAction, reopenGuestAction, type FormState } from "../actions";

const initialState: FormState = { error: null };

// Marcar/reabrir é manual, sem cálculo obrigatório (decisão confirmada
// com o usuário) — baixo risco (não apaga pagamento nem item já lançado),
// por isso um botão de texto direto, sem ConfirmDialog.
export function GuestSettleButton({
  tableId,
  guestId,
  isSettled,
}: {
  tableId: string;
  guestId: string;
  isSettled: boolean;
}) {
  const action = (isSettled ? reopenGuestAction : markGuestSettledAction).bind(null, tableId, guestId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        className="text-xs font-medium text-wine underline underline-offset-2"
      >
        {isSettled ? "Reabrir" : "Marcar quitada"}
      </button>
      {state.error && <p className="text-xs text-wine">{state.error}</p>}
    </form>
  );
}
