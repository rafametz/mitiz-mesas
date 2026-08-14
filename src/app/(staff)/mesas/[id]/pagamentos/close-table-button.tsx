"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/form/submit-button";
import { closeTableAction } from "./actions";

// Passo final (business-rules.md §6, passos 7-9) — irreversível (libera a
// mesa pro próximo cliente ou encerra a retirada, módulo Retiradas
// 2026-08-14), por isso confirmação, mesmo sem exigir motivo (não é uma
// anulação, é a conclusão normal do fluxo).
export function CloseTableButton({
  redirectPath,
  sessionId,
  itemLabel,
  disabled,
  disabledReason,
}: {
  redirectPath: string;
  sessionId: string;
  // "Mesa 3" ou "Retirada #47" — já formatado (formatSessionLabel).
  itemLabel: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const action = closeTableAction.bind(null, redirectPath, sessionId);

  return (
    <div className="flex flex-col gap-1.5">
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        Finalizar atendimento
      </Button>
      {disabled && disabledReason && <p className="text-xs text-muted">{disabledReason}</p>}

      <form action={action}>
        <ConfirmDialog
          open={open}
          title="Finalizar atendimento"
          description={`${itemLabel} será finalizada e encerrada. Esta ação não pode ser desfeita.`}
          cancelLabel="Voltar"
          onCancel={() => setOpen(false)}
          confirmSlot={<SubmitButton>Finalizar atendimento</SubmitButton>}
        />
      </form>
    </div>
  );
}
