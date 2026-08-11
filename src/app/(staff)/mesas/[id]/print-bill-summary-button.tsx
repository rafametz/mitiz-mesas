"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Printer } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { printBillSummaryAction, type PrintBillSummaryState } from "./actions";

const initialState: PrintBillSummaryState = { error: null, printerConfigured: null };

// Botão compacto ao lado do título "Resumo da comanda" — a ação imprime
// exatamente o que está naquele card mais totais/divisão/pagamentos, então
// fica junto do que está sendo impresso (CLAUDE.md rules/frontend-design.md:
// "uma ação principal evidente por contexto"), não escondido no cabeçalho
// da mesa.
export function PrintBillSummaryButton({
  tableId,
  sessionId,
}: {
  tableId: string;
  sessionId: string;
}) {
  const { showToast } = useToast();
  const action = printBillSummaryAction.bind(null, tableId, sessionId);
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
        className="flex items-center gap-1 rounded-control-sm px-1.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
      >
        <Printer className="h-3.5 w-3.5" />
        {isPending ? "Enviando..." : "Imprimir"}
      </button>
      {state.error && <p className="text-xs text-wine">{state.error}</p>}
    </form>
  );
}
