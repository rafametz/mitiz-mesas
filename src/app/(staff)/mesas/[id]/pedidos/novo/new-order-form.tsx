"use client";

import { useActionState, useMemo, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { createOrderAction, type FormState } from "../actions";

type ModifierOption = { id: string; name: string; priceDelta: string };
type ModifierGroupOption = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  modifiers: ModifierOption[];
};
type ProductOption = {
  id: string;
  name: string;
  price: string;
  categoryName: string;
  modifierGroups: ModifierGroupOption[];
};
type GuestOption = { id: string; name: string };

type CartItem = {
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  guestId?: string;
  guestName?: string;
  meatPoint?: string;
  notes?: string;
  modifierIds: string[];
  modifierNames: string[];
  // Estimativa client-side só para exibição — o servidor recalcula com
  // Decimal, esse número não vira registro financeiro em lugar nenhum.
  estimatedLineTotal: number;
};

const MEAT_POINTS = [
  { value: "MAL_PASSADO", label: "Mal passado" },
  { value: "AO_PONTO_PARA_MAL", label: "Ao ponto para mal" },
  { value: "AO_PONTO", label: "Ao ponto" },
  { value: "AO_PONTO_PARA_BEM", label: "Ao ponto para bem" },
  { value: "BEM_PASSADO", label: "Bem passado" },
];

const initialState: FormState = { error: null };

function formatBRLNumber(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function NewOrderForm({
  tableId,
  serviceSessionId,
  products,
  guests,
}: {
  tableId: string;
  serviceSessionId: string;
  products: ProductOption[];
  guests: GuestOption[];
}) {
  const action = createOrderAction.bind(null, tableId, serviceSessionId);
  const [state, formAction] = useActionState(action, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [guestId, setGuestId] = useState("");
  const [meatPoint, setMeatPoint] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const [itemError, setItemError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  function toggleModifier(modifierId: string) {
    setSelectedModifierIds((prev) =>
      prev.includes(modifierId) ? prev.filter((id) => id !== modifierId) : [...prev, modifierId],
    );
  }

  function addToCart() {
    if (!selectedProduct) return;

    for (const group of selectedProduct.modifierGroups) {
      const selectedCount = group.modifiers.filter((m) =>
        selectedModifierIds.includes(m.id),
      ).length;
      if (group.required && selectedCount === 0) {
        setItemError(`Selecione uma opção em "${group.name}".`);
        return;
      }
      if (selectedCount > group.maxSelect) {
        setItemError(`Selecione no máximo ${group.maxSelect} opção(ões) em "${group.name}".`);
        return;
      }
    }
    setItemError(null);

    const allModifiers = selectedProduct.modifierGroups.flatMap((g) => g.modifiers);
    const chosenModifiers = allModifiers.filter((m) => selectedModifierIds.includes(m.id));
    const modifiersTotal = chosenModifiers.reduce((sum, m) => sum + Number(m.priceDelta), 0);

    setCart((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        guestId: guestId || undefined,
        guestName: guests.find((g) => g.id === guestId)?.name,
        meatPoint: meatPoint || undefined,
        notes: notes || undefined,
        modifierIds: selectedModifierIds,
        modifierNames: chosenModifiers.map((m) => m.name),
        estimatedLineTotal: (Number(selectedProduct.price) + modifiersTotal) * quantity,
      },
    ]);

    setQuantity(1);
    setGuestId("");
    setMeatPoint("");
    setNotes("");
    setSelectedModifierIds([]);
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }

  const estimatedTotal = cart.reduce((sum, item) => sum + item.estimatedLineTotal, 0);

  const cartPayload = cart.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    guestId: item.guestId,
    meatPoint: item.meatPoint,
    notes: item.notes,
    modifierIds: item.modifierIds,
  }));

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
        <h2 className="font-display text-base font-semibold text-ink">Adicionar item</h2>

        <SelectField
          label="Produto"
          name="productId"
          value={selectedProductId}
          onChange={(e) => {
            setSelectedProductId(e.target.value);
            setSelectedModifierIds([]);
          }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.categoryName} — {product.name} ({formatBRLNumber(Number(product.price))})
            </option>
          ))}
        </SelectField>

        <TextField
          label="Quantidade"
          name="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
        />

        {guests.length > 0 && (
          <SelectField
            label="Pessoa (opcional — em branco = consumo geral)"
            name="guestId"
            value={guestId}
            onChange={(e) => setGuestId(e.target.value)}
          >
            <option value="">Consumo geral</option>
            {guests.map((guest) => (
              <option key={guest.id} value={guest.id}>
                {guest.name}
              </option>
            ))}
          </SelectField>
        )}

        {selectedProduct && selectedProduct.modifierGroups.length > 0 && (
          <div className="flex flex-col gap-3">
            {selectedProduct.modifierGroups.map((group) => (
              <div key={group.id}>
                <span className="text-sm font-medium text-ink">
                  {group.name}
                  {group.required && " (obrigatório)"}
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {group.modifiers.map((modifier) => (
                    <label key={modifier.id} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={selectedModifierIds.includes(modifier.id)}
                        onChange={() => toggleModifier(modifier.id)}
                        className="h-5 w-5 rounded border-line text-wine focus:ring-gold"
                      />
                      {modifier.name}
                      {Number(modifier.priceDelta) !== 0 &&
                        ` (+${formatBRLNumber(Number(modifier.priceDelta))})`}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <SelectField
          label="Ponto da carne (opcional)"
          name="meatPoint"
          value={meatPoint}
          onChange={(e) => setMeatPoint(e.target.value)}
        >
          <option value="">Não se aplica</option>
          {MEAT_POINTS.map((mp) => (
            <option key={mp.value} value={mp.value}>
              {mp.label}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Observação (opcional)"
          name="itemNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
        />

        {itemError && <p className="text-sm text-wine">{itemError}</p>}

        <button
          type="button"
          onClick={addToCart}
          className="h-11 rounded-lg border border-wine text-sm font-semibold text-wine hover:bg-wine/5"
        >
          Adicionar ao pedido
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Pedido ({cart.length} item(ns))
        </h2>
        {cart.length === 0 && <p className="text-sm text-muted">Nenhum item adicionado ainda.</p>}
        <ul className="flex flex-col gap-2">
          {cart.map((item) => (
            <li
              key={item.key}
              className="flex items-start justify-between rounded-card border border-line bg-surface p-3 text-sm"
            >
              <div>
                <div className="text-ink">
                  {item.quantity}x {item.productName}
                </div>
                {item.guestName && <div className="text-xs text-muted">Para: {item.guestName}</div>}
                {item.modifierNames.length > 0 && (
                  <div className="text-xs text-muted">+ {item.modifierNames.join(", ")}</div>
                )}
                {item.notes && <div className="text-xs text-muted">Obs.: {item.notes}</div>}
                <div className="tabular text-xs text-muted">
                  {formatBRLNumber(item.estimatedLineTotal)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeFromCart(item.key)}
                className="text-xs font-medium text-wine underline"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>

        {cart.length > 0 && (
          <p className="tabular text-sm font-semibold text-ink">
            Estimado: {formatBRLNumber(estimatedTotal)}
          </p>
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="cartJson" value={JSON.stringify(cartPayload)} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        {state.error && (
          <p role="alert" className="text-sm text-wine">
            {state.error}
          </p>
        )}
        <SubmitButton pendingLabel="Enviando pedido..." disabled={cart.length === 0}>
          {cart.length === 0 ? "Adicione itens para enviar" : "Enviar pedido"}
        </SubmitButton>
      </form>
    </div>
  );
}
