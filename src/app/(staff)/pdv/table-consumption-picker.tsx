"use client";

import { useState } from "react";
import { ChevronLeft, ShoppingBag, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import {
  formatCentsBRL,
  ItemSelectionCards,
  type CartEntry,
} from "../mesas/[id]/pagamentos/item-selection-list";
import type { ClientPayableLine } from "../mesas/[id]/pagamentos/payment-selection-lines";

export type ConsumptionOption = {
  sessionId: string;
  kind: "table" | "pickup";
  // Pronto pra exibir ("Mesa 3", "Retirada #12") — já vem formatado do
  // servidor (domain/service-session/labels.ts, mesmo helper usado em
  // produção/histórico/impressão), não recompõe o rótulo aqui.
  label: string;
  // Só pra revalidação (ShareItemForm, dentro de ItemSelectionCards) —
  // nunca navegado a partir daqui. Mesa: "/mesas/{tableId}". Retirada:
  // "/retiradas/{sessionId}" (retirada não tem mesa).
  redirectPath: string;
  balance: string;
  guestCount: number;
  lines: ClientPayableLine[];
};

export type ConsumptionSelection = {
  sessionId: string;
  kind: "table" | "pickup";
  label: string;
  redirectPath: string;
  entries: CartEntry[];
  totalCents: number;
};

// "+ Adicionar consumo de mesa ou retirada" (ADR 0010 — Pagamento
// Combinado; ampliado pra retirada em 2026-11-06, pedido do usuário:
// cliente que já tinha uma retirada aberta volta ao balcão e compra mais
// alguma coisa — precisa poder somar a conta da retirada na mesma venda
// do PDV, igual já acontecia só com mesa). Reaproveita o mesmo
// componente de seleção da tela de pagamento da mesa (ItemSelectionCards,
// extraído em item-selection-list.tsx) embutido no fluxo do PDV. A
// seleção continua sendo só rascunho local (nada gravado) até a
// confirmação final do recebimento combinado, lá na tela de Receber do
// PDV.
export function ConsumptionPicker({
  options,
  initialSelection,
  onConfirm,
  onClose,
}: {
  options: ConsumptionOption[];
  initialSelection: ConsumptionSelection | null;
  onConfirm: (selection: ConsumptionSelection | null) => void;
  onClose: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSelection?.sessionId ?? null,
  );
  const [cart, setCart] = useState<CartEntry[]>(initialSelection?.entries ?? []);

  const selected = options.find((o) => o.sessionId === selectedSessionId) ?? null;
  const totalCents = cart.reduce((sum, entry) => sum + entry.amountCents, 0);

  function upsertEntry(entry: CartEntry) {
    setCart((prev) => [...prev.filter((e) => e.key !== entry.key), entry]);
  }

  function removeEntry(key: string) {
    setCart((prev) => prev.filter((e) => e.key !== key));
  }

  function selectOption(option: ConsumptionOption) {
    setSelectedSessionId(option.sessionId);
    setCart(initialSelection?.sessionId === option.sessionId ? initialSelection.entries : []);
  }

  function confirmSelection() {
    if (!selected || cart.length === 0) return;
    onConfirm({
      sessionId: selected.sessionId,
      kind: selected.kind,
      label: selected.label,
      redirectPath: selected.redirectPath,
      entries: cart,
      totalCents,
    });
  }

  function removeSelectionEntirely() {
    onConfirm(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-end bg-ink/40 p-0 sm:justify-center sm:p-4">
      <div className="flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-t-panel bg-bg p-5 shadow-panel sm:max-w-lg sm:rounded-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selected && (
              <IconButton
                label="Voltar para a lista"
                icon={ChevronLeft}
                onClick={() => setSelectedSessionId(null)}
              />
            )}
            <h2 className="text-lg font-semibold text-ink">
              {selected ? selected.label : "Adicionar consumo de mesa ou retirada"}
            </h2>
          </div>
          <IconButton label="Fechar" icon={X} onClick={onClose} />
        </div>

        {!selected ? (
          options.length === 0 ? (
            <EmptyState
              icon={Table2}
              title="Nenhuma mesa ou retirada com saldo em aberto no momento."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {options.map((option) => {
                const Icon = option.kind === "table" ? Table2 : ShoppingBag;
                return (
                  <li key={option.sessionId}>
                    <button
                      type="button"
                      onClick={() => selectOption(option)}
                      className="flex w-full items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5 text-left transition-colors hover:border-wine/40 active:bg-wine/5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">
                            {option.label}
                          </span>
                          {option.kind === "table" && (
                            <span className="text-xs text-muted">
                              {option.guestCount} pessoa(s)
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold text-gold-dark">
                        {Number(option.balance).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}{" "}
                        em aberto
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <>
            <ItemSelectionCards
              redirectPath={selected.redirectPath}
              lines={selected.lines}
              guestCount={selected.guestCount}
              cart={cart}
              onChange={upsertEntry}
              onRemove={removeEntry}
              emptyMessage="Nenhum item em aberto neste atendimento."
            />

            <div className="flex items-center justify-between rounded-card bg-surface p-3.5">
              <span className="text-sm font-medium text-ink">Selecionado</span>
              <span className="tabular text-lg font-semibold text-ink">
                {formatCentsBRL(totalCents)}
              </span>
            </div>

            <div className="flex gap-2">
              {initialSelection && (
                <Button variant="outline" onClick={removeSelectionEntirely} className="flex-1">
                  Remover
                </Button>
              )}
              <Button onClick={confirmSelection} disabled={cart.length === 0} className="flex-1">
                Confirmar seleção
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
