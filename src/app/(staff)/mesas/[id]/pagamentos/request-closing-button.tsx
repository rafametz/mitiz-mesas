"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SubmitButton } from "@/components/form/submit-button";
import { requestClosingAction } from "./actions";

// Sem motivo (não é uma anulação) — mas ainda merece confirmação porque
// bloqueia novo pedido nesta mesa a partir de agora (createOrder exige
// status OPEN). requestClosingAction não segue o padrão FormState (redireciona
// no servidor ou lança o erro de domínio pro error boundary — mesma escolha
// de closeTableAction), então não precisa de useActionState aqui.
export function RequestClosingButton({
  tableId,
  sessionId,
  tableNumber,
}: {
  tableId: string;
  sessionId: string;
  tableNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const action = requestClosingAction.bind(null, tableId, sessionId);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Solicitar fechamento</Button>

      <form action={action}>
        <ConfirmDialog
          open={open}
          title="Solicitar fechamento"
          description={`A mesa ${tableNumber} deixa de aceitar novos pedidos e entra na etapa de fechamento (taxa, desconto e pagamento).`}
          cancelLabel="Voltar"
          onCancel={() => setOpen(false)}
          confirmSlot={<SubmitButton>Solicitar fechamento</SubmitButton>}
        />
      </form>
    </>
  );
}
