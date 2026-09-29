"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/form/submit-button";
import { deliverReservationAction } from "../actions";

// Entrega é definitiva no v1, sem reabertura (decisão do usuário
// 2026-09-29) — por isso confirmação, mesmo sem exigir motivo (não é uma
// anulação, é a conclusão normal do fluxo, mesmo racional de
// CloseTableButton).
export function DeliverButton({ reservationId, customerName }: { reservationId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const action = deliverReservationAction.bind(null, reservationId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Marcar como entregue</Button>
      <form action={action}>
        <ConfirmDialog
          open={open}
          title="Marcar como entregue"
          description={`A reserva de ${customerName} será marcada como entregue e não poderá mais ser editada ou cancelada.`}
          cancelLabel="Voltar"
          onCancel={() => setOpen(false)}
          confirmSlot={<SubmitButton>Marcar como entregue</SubmitButton>}
        />
      </form>
    </>
  );
}
