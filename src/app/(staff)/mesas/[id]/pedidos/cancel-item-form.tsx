"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "./actions";

const initialState: FormState = { error: null };
const MIN_REASON_LENGTH = 3;

// Cancelamento é ação destrutiva com registro obrigatório de motivo (CLAUDE.md
// regra 6/7) — mas isso não precisa ocupar um campo de texto + botão
// sempre abertos em todo item da comanda (feedback do usuário sobre a
// refatoração da tela da mesa: ficava "esquisito", parecia sistema
// administrativo). Agora é só um botão de texto compacto que abre um
// diálogo de confirmação com o motivo dentro — mesmo padrão já usado em
// RegenerateTokenForm (confirmação proporcional ao risco).
export function CancelItemForm({
  action,
  label,
  pendingLabel,
  successMessage,
  itemLabel,
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  pendingLabel: string;
  successMessage: string;
  // Nome do item mostrado no diálogo, pra ficar claro o que está sendo
  // cancelado sem precisar já estar olhando pro card (ex.: "2x Bife ancho").
  itemLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const { showToast } = useToast();

  // Mesmo racional de wasPending já usado no resto do app: só reage numa
  // transição pending -> settled de verdade, não no estado inicial (que
  // também tem error: null).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      showToast(successMessage);
      setOpen(false);
      setReason("");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.error]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-xs font-medium text-wine underline underline-offset-2"
      >
        {label}
      </button>

      <form action={formAction}>
        <ConfirmDialog
          open={open}
          title={label}
          description={`${itemLabel} — o motivo fica registrado e a ação não pode ser desfeita.`}
          // "Voltar" (não "Cancelar") de propósito — o botão de confirmar
          // já se chama "Cancelar"/"Solicitar cancelamento"; os dois
          // dizendo "Cancelar" com significados opostos (desistir do
          // diálogo vs. confirmar o cancelamento do item) confundiria.
          cancelLabel="Voltar"
          onCancel={() => setOpen(false)}
          confirmSlot={
            <SubmitButton
              variant="danger"
              pendingLabel={pendingLabel}
              disabled={reason.trim().length < MIN_REASON_LENGTH}
            >
              {label}
            </SubmitButton>
          }
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-medium text-ink">
              Motivo
            </label>
            <Input
              id={reasonId}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: cliente desistiu do prato"
              required
              minLength={MIN_REASON_LENGTH}
              maxLength={300}
              autoFocus
            />
            {state.error && (
              <p role="alert" className="text-xs text-wine">
                {state.error}
              </p>
            )}
          </div>
        </ConfirmDialog>
      </form>
    </>
  );
}
