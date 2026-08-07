"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { regeneratePrinterTokenAction, type RegenerateTokenState } from "../../actions";

const initialState: RegenerateTokenState = { token: null, error: null };

// Mostra o token em texto puro só uma vez, logo depois de gerado — depois
// de sair desta tela não tem como recuperar (só o hash fica salvo). Gerar
// de novo invalida o anterior na hora — por isso exige confirmação
// explícita antes de enviar (docs/design/frontend-audit.md, item "Modais":
// antes desta mudança, um clique acidental já derrubava a impressão real
// até alguém atualizar o .env do agente com o token novo).
export function RegenerateTokenForm({ printerId }: { printerId: string }) {
  const action = regeneratePrinterTokenAction.bind(null, printerId);
  const [state, formAction] = useActionState(action, initialState);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Token gerado com sucesso — fecha o diálogo sozinho pra revelar o
  // painel de "copie agora" logo abaixo.
  useEffect(() => {
    if (state.token) setConfirmOpen(false);
  }, [state.token]);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div>
        <h2 className="font-display text-sm font-semibold text-ink">Token do agente local</h2>
        <p className="mt-1 text-xs text-muted">
          O agente (rodando no computador ligado na impressora) usa esse token pra autenticar contra{" "}
          <code className="rounded bg-ink/5 px-1">/api/print-jobs</code>. Gerar um novo invalida
          qualquer token anterior imediatamente.
        </p>
      </div>

      <Button variant="outline" onClick={() => setConfirmOpen(true)} className="self-start">
        Gerar novo token
      </Button>

      <form action={formAction}>
        <ConfirmDialog
          open={confirmOpen}
          title="Gerar novo token?"
          description="O agente de impressão para de puxar a fila até alguém atualizar o .env dele com o novo token — isso acontece imediatamente, não dá pra desfazer."
          onCancel={() => setConfirmOpen(false)}
          confirmSlot={
            <SubmitButton variant="danger" pendingLabel="Gerando...">
              Gerar mesmo assim
            </SubmitButton>
          }
        />
      </form>

      {state.token && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 p-3">
          <p className="text-xs font-semibold text-gold-dark">
            Copie agora — não aparece de novo depois de sair desta tela:
          </p>
          <code className="mt-1 block break-all rounded bg-surface px-2 py-1.5 text-xs text-ink">
            {state.token}
          </code>
        </div>
      )}
    </div>
  );
}
