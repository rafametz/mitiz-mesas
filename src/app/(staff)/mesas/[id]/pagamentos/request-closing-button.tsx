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
  label = "Solicitar fechamento",
  variant = "primary",
  className,
}: {
  tableId: string;
  sessionId: string;
  tableNumber: string;
  // "Fechar mesa" (mais direto, usado como entrada principal na tela da
  // mesa) vs. "Solicitar fechamento" (padrão, dentro da própria tela de
  // fechamento/pagamentos) — mesma ação, só o rótulo muda conforme o
  // contexto onde o botão aparece. Aceita ReactNode pra poder compor com
  // ícone (ex.: entrada da tela da mesa).
  label?: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const action = requestClosingAction.bind(null, tableId, sessionId);

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>

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
