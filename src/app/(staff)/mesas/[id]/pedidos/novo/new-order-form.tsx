"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { SelectField, TextAreaField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
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

// Mesmo intervalo validado no servidor (createOrderSchema em
// src/application/order/create-order.ts) — clampar aqui é só conveniência
// de UI, a validação real continua no backend (CLAUDE.md regra 24).
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 50;

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(value)));
}

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
  const router = useRouter();
  const { showToast } = useToast();
  const action = createOrderAction.bind(null, tableId, serviceSessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // A action não redireciona mais no servidor (docs/performance/
  // optimization-plan.md, Fase 4) — o pedido já está confirmado assim
  // que `state.success` chega aqui. Mostra a confirmação e navega na
  // hora, em vez de esperar uma navegação completa vinda do servidor.
  // `wasPending` distingue "acabou de enviar com sucesso" de "estado
  // inicial" (que também tem success falsy).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Pedido enviado.");
      // A lista de pedidos vive na tela principal da mesa desde a
      // refatoração mobile-first (não existe mais "/pedidos" própria).
      router.push(`/mesas/${tableId}`);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  // String, não number — bug de usabilidade no celular: com o campo
  // controlado por um `number` que voltava pra "1" a cada tecla vazia
  // (Number("") é 0, que é falsy), o garçom nunca conseguia apagar o "1"
  // pra digitar outro número — o próximo dígito sempre grudava depois
  // ("2" virava "12"). Guardando o texto bruto, o campo pode ficar vazio
  // enquanto a pessoa digita; só normaliza (mínimo 1) ao sair do campo.
  const [quantityInput, setQuantityInput] = useState("1");
  const quantity = clampQuantity(Number(quantityInput));

  function setQuantityClamped(next: number) {
    setQuantityInput(String(clampQuantity(next)));
  }

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

    setQuantityInput("1");
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
      <Card className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Quantidade</span>
          <div className="flex items-center gap-2">
            <IconButton
              label="Diminuir quantidade"
              icon={Minus}
              size="md"
              className="border border-line disabled:pointer-events-none disabled:opacity-40"
              onClick={() => setQuantityClamped(quantity - 1)}
              disabled={quantity <= MIN_QUANTITY}
            />
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="Quantidade"
              value={quantityInput}
              onChange={(e) => {
                const raw = e.target.value;
                // Só dígitos, campo pode ficar vazio enquanto digita — ver
                // comentário em quantityInput acima.
                if (raw === "" || /^\d+$/.test(raw)) setQuantityInput(raw);
              }}
              onFocus={(e) => e.target.select()}
              onBlur={() => setQuantityInput(String(quantity))}
              className="h-11 w-16 rounded-control-sm border border-line bg-surface text-center tabular text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
            <IconButton
              label="Aumentar quantidade"
              icon={Plus}
              size="md"
              className="border border-line disabled:pointer-events-none disabled:opacity-40"
              onClick={() => setQuantityClamped(quantity + 1)}
              disabled={quantity >= MAX_QUANTITY}
            />
          </div>
        </div>

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

        <Button variant="secondary" onClick={addToCart}>
          Adicionar ao pedido
        </Button>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Pedido ({cart.length} item(ns))
        </h2>
        {cart.length === 0 && (
          <EmptyState icon={ShoppingCart} title="Nenhum item adicionado ainda." />
        )}
        <ul className="flex flex-col gap-2">
          {cart.map((item) => (
            <li key={item.key}>
              <Card padding="sm" className="flex items-start justify-between text-sm">
                <div>
                  <div className="text-ink">
                    {item.quantity}x {item.productName}
                  </div>
                  {item.guestName && (
                    <div className="text-xs text-muted">Para: {item.guestName}</div>
                  )}
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
              </Card>
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
