"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { reprintReservationAction, type FormState } from "../actions";

const initialState: FormState = { error: null };

// Reimpressão do ticket da reserva (pedido do usuário 2026-10-04): o ticket
// sai automaticamente só ao criar a reserva; quando o papel se perde ou
// some, quem entrega precisa de um novo. Gera um job novo com os dados
// atuais da reserva, sem reaproveitar o papel antigo.
export function ReprintButton({ reservationId }: { reservationId: string }) {
  const { showToast } = useToast();
  const action = reprintReservationAction.bind(null, reservationId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Ticket enviado para impressão.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton variant="outline" pendingLabel="Enviando...">
        Imprimir novamente
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-wine">
          {state.error}
        </p>
      )}
    </form>
  );
}
