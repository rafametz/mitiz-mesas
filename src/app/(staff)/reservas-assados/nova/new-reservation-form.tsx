"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createReservationAction, type FormState } from "../actions";
import { QuantityStepper } from "../quantity-stepper";

type ProductOption = { roastProductId: string; name: string; unit: string; available: number };

const initialState: FormState = { error: null };

export function NewReservationForm({
  restaurantId,
  productionDayId,
  date,
  products,
}: {
  restaurantId: string;
  productionDayId: string;
  date: string;
  products: ProductOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = createReservationAction.bind(null, productionDayId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Reserva criada.");
      router.push(`/reservas-assados?data=${date}`);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const items = useMemo(
    () =>
      products
        .map((product) => ({
          roastProductId: product.roastProductId,
          quantity: Number(quantities[product.roastProductId] ?? 0),
        }))
        .filter((item) => item.quantity > 0),
    [products, quantities],
  );

  if (products.length === 0) {
    return (
      <EmptyState title="Nenhum produto com disponibilidade cadastrada para este dia ainda." />
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <TextField label="Nome do cliente" name="customerName" required maxLength={120} autoFocus />
      <TextField
        label="Telefone (opcional)"
        name="customerPhone"
        type="tel"
        maxLength={30}
        placeholder="(11) 99999-9999"
      />

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">Itens</h2>
        {products.map((product) => {
          const sold = product.available <= 0;
          return (
            <div key={product.roastProductId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{product.name}</div>
                <div className="text-xs text-muted">
                  {sold ? "Esgotado" : `Disponível: ${product.available} ${product.unit}`}
                </div>
              </div>
              <QuantityStepper
                ariaLabel={`Quantidade de ${product.name}`}
                disabled={sold}
                value={quantities[product.roastProductId] ?? ""}
                onChange={(next) =>
                  setQuantities((prev) => ({ ...prev, [product.roastProductId]: next }))
                }
              />
            </div>
          );
        })}
      </Card>

      <TextAreaField label="Observação (opcional)" name="notes" maxLength={500} />

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Criando reserva..." disabled={items.length === 0}>
        {items.length === 0 ? "Adicione ao menos um item" : "Criar reserva"}
      </SubmitButton>
    </form>
  );
}
