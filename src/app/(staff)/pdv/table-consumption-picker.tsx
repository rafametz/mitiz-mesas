"use client";

import { useState } from "react";
import { ChevronLeft, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import {
  formatCentsBRL,
  ItemSelectionCards,
  type CartEntry,
} from "../mesas/[id]/pagamentos/item-selection-list";
import type { ClientPayableLine } from "../mesas/[id]/pagamentos/payment-selection-lines";

export type TableOption = {
  sessionId: string;
  tableId: string;
  tableNumber: string;
  balance: string;
  guestCount: number;
  lines: ClientPayableLine[];
};

export type TableSelection = {
  sessionId: string;
  tableNumber: string;
  entries: CartEntry[];
  totalCents: number;
};

// "+ Adicionar consumo de mesa" (ADR 0010 — Pagamento Combinado): reaproveita
// o mesmo componente de seleção da tela de pagamento da mesa
// (ItemSelectionCards, extraído em item-selection-list.tsx) embutido no
// fluxo do PDV — pedido explícito do usuário, seção 4 da ADR. A seleção
// continua sendo só rascunho local (nada gravado) até a confirmação final
// do recebimento combinado, lá na tela de Receber do PDV.
export function TableConsumptionPicker({
  tables,
  initialSelection,
  onConfirm,
  onClose,
}: {
  tables: TableOption[];
  initialSelection: TableSelection | null;
  onConfirm: (selection: TableSelection | null) => void;
  onClose: () => void;
}) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialSelection?.sessionId ?? null,
  );
  const [cart, setCart] = useState<CartEntry[]>(initialSelection?.entries ?? []);

  const selectedTable = tables.find((t) => t.sessionId === selectedSessionId) ?? null;
  const totalCents = cart.reduce((sum, entry) => sum + entry.amountCents, 0);

  function upsertEntry(entry: CartEntry) {
    setCart((prev) => [...prev.filter((e) => e.key !== entry.key), entry]);
  }

  function removeEntry(key: string) {
    setCart((prev) => prev.filter((e) => e.key !== key));
  }

  function selectTable(table: TableOption) {
    setSelectedSessionId(table.sessionId);
    setCart(initialSelection?.sessionId === table.sessionId ? initialSelection.entries : []);
  }

  function confirmSelection() {
    if (!selectedTable || cart.length === 0) return;
    onConfirm({
      sessionId: selectedTable.sessionId,
      tableNumber: selectedTable.tableNumber,
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
            {selectedTable && (
              <IconButton
                label="Voltar para a lista de mesas"
                icon={ChevronLeft}
                onClick={() => setSelectedSessionId(null)}
              />
            )}
            <h2 className="font-display text-lg font-semibold text-ink">
              {selectedTable ? `Mesa ${selectedTable.tableNumber}` : "Adicionar consumo de mesa"}
            </h2>
          </div>
          <IconButton label="Fechar" icon={X} onClick={onClose} />
        </div>

        {!selectedTable ? (
          tables.length === 0 ? (
            <EmptyState icon={Table2} title="Nenhuma mesa com saldo em aberto no momento." />
          ) : (
            <ul className="flex flex-col gap-2">
              {tables.map((table) => (
                <li key={table.sessionId}>
                  <button
                    type="button"
                    onClick={() => selectTable(table)}
                    className="flex w-full items-center justify-between gap-2 rounded-card border border-line bg-surface p-3.5 text-left transition-colors hover:border-wine/40 active:bg-wine/5"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-ink">
                        Mesa {table.tableNumber}
                      </span>
                      <span className="text-xs text-muted">{table.guestCount} pessoa(s)</span>
                    </span>
                    <span className="tabular text-sm font-semibold text-gold-dark">
                      {Number(table.balance).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      em aberto
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <ItemSelectionCards
              redirectPath={`/mesas/${selectedTable.tableId}`}
              lines={selectedTable.lines}
              guestCount={selectedTable.guestCount}
              cart={cart}
              onChange={upsertEntry}
              onRemove={removeEntry}
              emptyMessage="Nenhum item em aberto nesta mesa."
            />

            <div className="flex items-center justify-between rounded-card bg-surface p-3.5">
              <span className="text-sm font-medium text-ink">Selecionado</span>
              <span className="tabular font-display text-lg font-semibold text-ink">
                {formatCentsBRL(totalCents)}
              </span>
            </div>

            <div className="flex gap-2">
              {initialSelection && (
                <Button variant="outline" onClick={removeSelectionEntirely} className="flex-1">
                  Remover mesa
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
