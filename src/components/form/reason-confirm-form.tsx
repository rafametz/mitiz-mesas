"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

type FormState = { error: string | null; success?: boolean };
const initialState: FormState = { error: null };
const MIN_REASON_LENGTH = 3;

// Generalização de mesas/[id]/pedidos/cancel-item-form.tsx (mesmo padrão:
// botão de texto compacto -> ConfirmDialog com motivo obrigatório -> toast
// de sucesso) para qualquer ação financeira "anular" que também exige
// motivo registrado (regra 6/14 do CLAUDE.md) — hoje usado para anular
// desconto e estornar pagamento (Módulo 8 Fase B). Não substitui
// CancelItemForm (cancelamento de item já publicado e testado) — evita
// tocar em fluxo já validado só para reduzir duplicação.
export function ReasonConfirmForm({
  action,
  triggerLabel,
  dialogTitle,
  itemLabel,
  pendingLabel,
  successMessage,
  triggerClassName = "text-xs font-medium text-wine underline underline-offset-2",
}: {
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
  triggerLabel: string;
  dialogTitle: string;
  // Descreve o que está sendo anulado/estornado no diálogo (ex.: "Desconto
  // de R$ 20,00", "Pagamento de R$ 50,00 em Dinheiro").
  itemLabel: string;
  pendingLabel: string;
  successMessage: string;
  triggerClassName?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const { showToast } = useToast();

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
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>

      <form action={formAction}>
        <ConfirmDialog
          open={open}
          title={dialogTitle}
          description={`${itemLabel} — o motivo fica registrado e a ação não pode ser desfeita.`}
          cancelLabel="Voltar"
          onCancel={() => setOpen(false)}
          confirmSlot={
            <SubmitButton
              variant="danger"
              pendingLabel={pendingLabel}
              disabled={reason.trim().length < MIN_REASON_LENGTH}
            >
              {triggerLabel}
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
              placeholder="Explique o motivo"
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
