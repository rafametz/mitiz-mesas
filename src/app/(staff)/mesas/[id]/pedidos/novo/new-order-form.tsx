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
  categoryId: string;
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
  redirectPath,
  serviceSessionId,
  products,
  guests,
}: {
  // URL da tela principal do atendimento (`/mesas/{id}` ou
  // `/retiradas/{id}` — módulo Retiradas, 2026-08-14): pra onde volta
  // depois de enviar o pedido. O carrinho em si não sabe (nem precisa
  // saber) se é mesa ou retirada.
  redirectPath: string;
  serviceSessionId: string;
  products: ProductOption[];
  guests: GuestOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = createOrderAction.bind(null, redirectPath, serviceSessionId);
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
      // A lista de pedidos vive na tela principal do atendimento desde a
      // refatoração mobile-first (não existe mais "/pedidos" própria).
      router.push(redirectPath);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success, redirectPath]);

  const [cart, setCart] = useState<CartItem[]>([]);

  // Filtro por categoria (pedido do usuário 2026-08-13): com muitos
  // produtos cadastrados, rolar uma lista/select única fica difícil e
  // sujeito a erro de seleção. Categorias na mesma ordem já configurada em
  // Administração (products vem ordenado por category.sortOrder — ver
  // page.tsx), primeira categoria com produto já entra selecionada, então
  // a lista mostrada sempre começa curta.
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products) {
      if (!seen.has(product.categoryId)) seen.set(product.categoryId, product.categoryName);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [products]);

  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");

  const categoryProducts = useMemo(
    () => products.filter((product) => product.categoryId === selectedCategoryId),
    [products, selectedCategoryId],
  );

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

  function selectCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setSelectedProductId(products.find((product) => product.categoryId === categoryId)?.id ?? "");
    setSelectedModifierIds([]);
  }

  function selectProduct(productId: string) {
    setSelectedProductId(productId);
    setSelectedModifierIds([]);
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

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Categoria</span>
          <div
            role="tablist"
            aria-label="Filtrar produtos por categoria"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {categories.map((category) => {
              const isActive = category.id === selectedCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => selectCategory(category.id)}
                  className={`h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-wine text-bg"
                      : "border border-line text-ink hover:bg-ink/5"
                  }`}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Produto</span>
          <div
            role="radiogroup"
            aria-label="Produto"
            className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-control-sm border border-line p-1.5"
          >
            {categoryProducts.map((product) => {
              const isSelected = product.id === selectedProductId;
              return (
                <button
                  key={product.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => selectProduct(product.id)}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-control-sm px-3 py-2.5 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-wine/10 text-wine ring-1 ring-inset ring-wine"
                      : "text-ink hover:bg-ink/5"
                  }`}
                >
                  <span className="truncate">{product.name}</span>
                  <span className="tabular shrink-0 text-xs text-muted">
                    {formatBRLNumber(Number(product.price))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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
            label="Pessoa (opcional, em branco = consumo geral)"
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
