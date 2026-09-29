"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { TextAreaField } from "@/components/form/field";
import { QuantityStepper } from "@/components/form/quantity-stepper";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveProductionDayAction, type FormState } from "./actions";

type ProductRow = {
  roastProductId: string;
  name: string;
  unit: string;
  plannedQuantity: number;
  reservedQuantity: number;
};

const initialState: FormState = { error: null };

// Trabalha por `date` (não por um `dayId` fixo) — o dia de produção pode
// ainda não existir quando o admin navega pra um domingo nunca
// configurado antes (mesmo racional da tela de reservas do garçom, que
// também navega por data). `manageProductionDay` já faz upsert por
// (restaurantId, date), então salvar aqui cria o dia na hora se precisar.
export function ProductionDayForm({
  date,
  notes,
  products,
}: {
  date: string;
  notes: string;
  products: ProductRow[];
}) {
  const { showToast } = useToast();
  const action = saveProductionDayAction.bind(null, date);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Produção do dia salva.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  // Sempre inteiro (pedido do usuário 2026-10-04: mesmo padrão da
  // quantidade de reserva) — um valor fracionado que já existia no banco
  // (de antes desta regra) aparece arredondado aqui; só grava de volta se
  // o admin salvar de novo. Quem chama passa `key={date}` (ver page.tsx)
  // pra este estado reiniciar sozinho ao trocar de domingo, em vez de um
  // efeito manual comparando a data anterior.
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products.map((p) => [p.roastProductId, String(Math.round(p.plannedQuantity))]),
    ),
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
              <QuantityStepper
                ariaLabel={`Quantidade planejada de ${product.name}`}
                value={quantities[product.roastProductId] ?? ""}
                onChange={(next) =>
                  setQuantities((prev) => ({ ...prev, [product.roastProductId]: next }))
                }
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
