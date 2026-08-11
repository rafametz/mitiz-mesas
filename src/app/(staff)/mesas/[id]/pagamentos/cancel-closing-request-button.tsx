"use client";

import { SubmitButton } from "@/components/form/submit-button";
import { cancelClosingRequestAction } from "./actions";

// Volta CLOSING -> OPEN (revisão 2026-08-10) — risco baixo (não perde
// nenhum dado, só volta a aceitar pedido), por isso sem ConfirmDialog,
// diferente de RequestClosingButton/CloseTableButton (confirmação
// proporcional ao risco).
export function CancelClosingRequestButton({
  tableId,
  sessionId,
}: {
  tableId: string;
  sessionId: string;
}) {
  const action = cancelClosingRequestAction.bind(null, tableId, sessionId);
  return (
    <form action={action}>
      <SubmitButton variant="outline" pendingLabel="Cancelando...">
        Cancelar solicitação de fechamento
      </SubmitButton>
    </form>
  );
}
