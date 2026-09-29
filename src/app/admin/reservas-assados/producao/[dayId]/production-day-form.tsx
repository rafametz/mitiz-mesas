"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { TextAreaField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveProductionDayAction, type FormState } from "../actions";

type ProductRow = {
  roastProductId: string;
  name: string;
  unit: string;
  plannedQuantity: number;
  reservedQuantity: number;
};

const initialState: FormState = { error: null };

export function ProductionDayForm({
  productionDayId,
  notes,
  products,
}: {
  productionDayId: string;
  notes: string;
  products: ProductRow[];
}) {
  const { showToast } = useToast();
  const action = saveProductionDayAction.bind(null, productionDayId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Produção do dia salva.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.roastProductId, String(p.plannedQuantity)])),
  );

  const quantitiesJson = useMemo(() => JSON.stringify(quantities), [quantities]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="quantitiesJson" value={quantitiesJson} />

      <Card className="flex flex-col gap-3">
        {products.map((product) => (
          <div key={product.roastProductId} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-ink">{product.name}</div>
              {product.reservedQuantity > 0 && (
                <div className="text-xs text-muted">
                  {product.reservedQuantity} {product.unit} já reservado(s)
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                aria-label={`Quantidade planejada de ${product.name}`}
                value={quantities[product.roastProductId] ?? ""}
                onChange={(e) =>
                  setQuantities((prev) => ({ ...prev, [product.roastProductId]: e.target.value }))
                }
                className="h-11 w-24 rounded-control-sm border border-line bg-surface text-center tabular text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
              />
              <span className="text-xs text-muted">{product.unit}</span>
            </div>
          </div>
        ))}
      </Card>

      <TextAreaField label="Observação (opcional)" name="notes" defaultValue={notes} maxLength={500} />

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Salvando..." className="self-start">
        Salvar produção do dia
      </SubmitButton>
    </form>
  );
}
