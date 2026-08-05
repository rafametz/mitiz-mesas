"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { regeneratePrinterTokenAction, type RegenerateTokenState } from "../../actions";

const initialState: RegenerateTokenState = { token: null, error: null };

// Mostra o token em texto puro só uma vez, logo depois de gerado — depois
// de sair desta tela não tem como recuperar (só o hash fica salvo). Gerar
// de novo invalida o anterior na hora.
export function RegenerateTokenForm({ printerId }: { printerId: string }) {
  const action = regeneratePrinterTokenAction.bind(null, printerId);
  const [state, formAction] = useActionState(action, initialState);

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

      <form action={formAction}>
        <SubmitButton variant="outline" pendingLabel="Gerando...">
          Gerar novo token
        </SubmitButton>
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
