"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { editReservationAction, type FormState } from "../../actions";
import { QuantityStepper } from "../../quantity-stepper";

type ProductOption = {
  roastProductId: string;
  name: string;
  unit: string;
  available: number;
  initialQuantity: number;
};

const initialState: FormState = { error: null };

export function EditReservationForm({
  reservationId,
  customerName,
  customerPhone,
  notes,
  products,
}: {
  reservationId: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  products: ProductOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = editReservationAction.bind(null, reservationId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Reserva atualizada.");
      router.push(`/reservas-assados/${reservationId}`);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products
        .filter((p) => p.initialQuantity > 0)
        .map((p) => [p.roastProductId, String(p.initialQuantity)]),
    ),
  );

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

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <TextField
        label="Nome do cliente"
        name="customerName"
        defaultValue={customerName}
        required
        maxLength={120}
      />
      <TextField
        label="Telefone (opcional)"
        name="customerPhone"
        type="tel"
        defaultValue={customerPhone}
        maxLength={30}
      />

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">Itens</h2>
        {products.map((product) => {
          // Disponível já soma de volta o que esta reserva ocupava antes
          // da edição (ver page.tsx) — sold só se realmente não sobrar nada.
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

      <TextAreaField label="Observação (opcional)" name="notes" defaultValue={notes} maxLength={500} />

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton pendingLabel="Salvando..." disabled={items.length === 0}>
        {items.length === 0 ? "Adicione ao menos um item" : "Salvar alterações"}
      </SubmitButton>
    </form>
  );
}
