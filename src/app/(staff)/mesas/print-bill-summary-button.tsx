"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Printer } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { printBillSummaryAction, type PrintBillSummaryState } from "./[id]/actions";

const initialState: PrintBillSummaryState = { error: null, printerConfigured: null };

// Compartilhado entre o grid de mesas (/mesas — pedido do usuário: "não
// localizei o botão... gostaria que ficasse na tela /mesas") e o card
// "Resumo da comanda" na tela da mesa — mesma ação, dois contextos: um
// ícone compacto no card pra imprimir sem precisar entrar na mesa, um
// botão com rótulo junto do que está sendo impresso.
export function PrintBillSummaryButton({
  redirectPath,
  sessionId,
  iconOnly = false,
}: {
  // `/mesas/{id}` ou `/retiradas/{id}` (módulo Retiradas, 2026-08-14).
  redirectPath: string;
  sessionId: string;
  iconOnly?: boolean;
}) {
  const { showToast } = useToast();
  const action = printBillSummaryAction.bind(null, redirectPath, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) {
      showToast(
        state.printerConfigured
          ? "Conferência enviada para a impressora."
          : "Conferência registrada, mas nenhuma impressora está cadastrada ainda.",
      );
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.error, state.printerConfigured]);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={isPending}
        aria-label="Imprimir conferência"
        title="Imprimir conferência"
        className={
          iconOnly
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-control-sm bg-surface/90 text-muted shadow-sm ring-1 ring-line transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
            : "flex items-center gap-1 rounded-control-sm px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
        }
      >
        <Printer className={iconOnly ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {!iconOnly && (isPending ? "Enviando..." : "Imprimir")}
      </button>
      {state.error && <p className="text-xs text-wine">{state.error}</p>}
    </form>
  );
}
