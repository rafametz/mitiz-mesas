"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingBag, ShoppingCart, Table2, Trash2, X } from "lucide-react";
import { SelectField } from "@/components/form/field";
import { QuantityStepper } from "@/components/form/quantity-stepper";
import { SearchField } from "@/components/form/search-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { registerCombinedCheckoutAction, sellPdvAction, type FormState } from "./actions";
import {
  ConsumptionPicker,
  type ConsumptionOption,
  type ConsumptionSelection,
} from "./table-consumption-picker";

type ProductOption = {
  id: string;
  name: string;
  price: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
};
type PaymentMethodOption = { id: string; name: string };
type CartLine = {
  key: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
};
type PaymentLine = {
  key: string;
  idempotencyKey: string;
  paymentMethodId: string;
  amountInput: string;
  cashReceivedInput: string;
};

const initialState: FormState = { error: null };

function formatBRLNumber(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// Entrada em formato brasileiro ("12,34" ou "12.34") → número. Usado só na
// tela de recebimento (forma de pagamento + valor), que precisa ler o
// valor em JS pra calcular "falta"/"confere" ao vivo — MoneyField (usada
// no resto do app) não expõe isso, só escreve num input escondido.
function parseBRLInput(value: string): number {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newPaymentLine(paymentMethodId: string, amount: number): PaymentLine {
  return {
    key: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    paymentMethodId,
    amountInput: amount > 0 ? amount.toFixed(2).replace(".", ",") : "",
    cashReceivedInput: "",
  };
}

export function PdvSaleScreen({
  restaurantId,
  products,
  paymentMethods,
  consumptionOptions,
}: {
  restaurantId: string;
  products: ProductOption[];
  paymentMethods: PaymentMethodOption[];
  consumptionOptions: ConsumptionOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  // Pagamento Combinado (ADR 0010; ampliado pra retirada em 2026-11-06):
  // com consumo de mesa OU retirada selecionado, a confirmação final
  // vira registerCombinedCheckoutAction em vez de sellPdvAction — mesmo
  // carrinho de loja, só muda o que acontece ao confirmar.
  const [consumptionSelection, setConsumptionSelection] = useState<ConsumptionSelection | null>(
    null,
  );
  const action = consumptionSelection
    ? registerCombinedCheckoutAction.bind(null, restaurantId)
    : sellPdvAction.bind(null, restaurantId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState(() => crypto.randomUUID());
  const [combinedIdempotencyKey, setCombinedIdempotencyKey] = useState(() => crypto.randomUUID());
  const [tablePaymentMethodId, setTablePaymentMethodId] = useState(paymentMethods[0]?.id ?? "");
  const [tablePaymentIdempotencyKey, setTablePaymentIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  // "" (nenhuma categoria escolhida ainda) é o estado inicial, diferente de
  // "all" ("Todas", escolhida de propósito) — catálogo tem centenas de
  // produtos (importação VHSYS), então listar tudo de cara deixava a tela
  // enorme e sem fim; agora só mostra produto depois que a pessoa busca ou
  // toca numa categoria (decisão do usuário 2026-11-03, comparando com o
  // PDV do VHSYS que ela já usa).
  const [categoryId, setCategoryId] = useState("");
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Venda registrada.");
      setCart([]);
      setConsumptionSelection(null);
      setCheckoutOpen(false);
      setCartSheetOpen(false);
      setOrderIdempotencyKey(crypto.randomUUID());
      setCombinedIdempotencyKey(crypto.randomUUID());
      setTablePaymentIdempotencyKey(crypto.randomUUID());
      router.refresh();
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products) {
      if (!seen.has(product.categoryId)) seen.set(product.categoryId, product.categoryName);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [products]);

  const normalizedSearch = search.trim().toLowerCase();
  // Nada escolhido ainda (nem categoria, nem busca) → não lista produto
  // nenhum, só o convite abaixo. Busca casa com qualquer trecho do
  // nome/código/código de barras (não só o começo), então digitar parte de
  // qualquer palavra já filtra.
  const shouldShowProducts = categoryId !== "" || normalizedSearch !== "";
  const filteredProducts = useMemo(() => {
    if (!shouldShowProducts) return [];
    return products.filter((product) => {
      if (categoryId !== "all" && categoryId !== "" && product.categoryId !== categoryId)
        return false;
      if (!normalizedSearch) return true;
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.sku?.toLowerCase().includes(normalizedSearch) ?? false) ||
        (product.barcode?.toLowerCase().includes(normalizedSearch) ?? false)
      );
    });
  }, [products, categoryId, normalizedSearch, shouldShowProducts]);

  function addToCart(product: ProductOption, quantity = 1) {
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.key === existing.key ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price),
          quantity,
        },
      ];
    });
  }

  function setLineQuantity(key: string, quantityInput: string) {
    const quantity = Math.trunc(Number(quantityInput || 0));
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.key !== key)
        : prev.map((line) => (line.key === key ? { ...line, quantity } : line)),
    );
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
  }

  // "Cancelar venda" (CartPanel) — equivalente ao CANCELAR (F9) do PDV do
  // VHSYS que a equipe já usa: limpa tudo que foi lançado até agora (itens
  // da loja + consumo de mesa ou retirada selecionado) numa ação só, em
  // vez de remover item por item. Confirmação porque desfaz trabalho em
  // andamento.
  function requestClear() {
    if (cart.length === 0 && !consumptionSelection) return;
    setClearConfirmOpen(true);
  }

  function confirmClear() {
    setCart([]);
    setConsumptionSelection(null);
    setClearConfirmOpen(false);
  }

  // Leitor de código de barras USB/Bluetooth funciona como teclado: digita
  // rápido e manda Enter. Casamento exato em código de barras ou SKU
  // adiciona direto ao carrinho, sem precisar tocar no card (pedido
  // original: "busca por nome/código/código de barras").
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const query = search.trim().toLowerCase();
    if (!query) return;
    const exact = products.find(
      (product) => product.barcode?.toLowerCase() === query || product.sku?.toLowerCase() === query,
    );
    if (exact) {
      event.preventDefault();
      addToCart(exact);
      setSearch("");
      showToast(`${exact.name} adicionado.`);
    }
  }

  const lojaTotal = round2(cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const tableTotal = round2((consumptionSelection?.totalCents ?? 0) / 100);
  const grandTotal = round2(lojaTotal + tableTotal);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  const paymentsTotal = round2(
    paymentLines.reduce((sum, line) => sum + parseBRLInput(line.amountInput), 0),
  );
  const remaining = round2(lojaTotal - paymentsTotal);
  const tableLegReady = !consumptionSelection || Boolean(tablePaymentMethodId);

  function openCheckout() {
    if (cart.length === 0 && !consumptionSelection) return;
    setPaymentLines(lojaTotal > 0 ? [newPaymentLine(paymentMethods[0]?.id ?? "", lojaTotal)] : []);
    setTablePaymentMethodId(paymentMethods[0]?.id ?? "");
    setPaymentError(null);
    setCheckoutOpen(true);
    setCartSheetOpen(false);
  }

  function addPaymentLine() {
    setPaymentLines((prev) => [
      ...prev,
      newPaymentLine(paymentMethods[0]?.id ?? "", Math.max(remaining, 0)),
    ]);
  }

  function removePaymentLine(key: string) {
    setPaymentLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  function updatePaymentLine(key: string, patch: Partial<PaymentLine>) {
    setPaymentLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function isCashMethod(paymentMethodId: string): boolean {
    const method = paymentMethods.find((m) => m.id === paymentMethodId);
    return (method?.name ?? "").toLowerCase().includes("dinheiro");
  }

  const paymentsPayload = paymentLines.map((line) => {
    const cashReceived = isCashMethod(line.paymentMethodId)
      ? parseBRLInput(line.cashReceivedInput)
      : 0;
    return {
      paymentMethodId: line.paymentMethodId,
      amount: parseBRLInput(line.amountInput),
      idempotencyKey: line.idempotencyKey,
      // Só para o recibo (troco impresso) — nunca usado pra validar nem
      // gravar o pagamento em si (decisão do usuário, visão da Fase 2).
      ...(cashReceived > 0 ? { cashReceived } : {}),
    };
  });
  const cartPayload = cart.map((line) => ({ productId: line.productId, quantity: line.quantity }));
  const tableAllocationsPayload = consumptionSelection?.entries.map((entry) => entry.payload) ?? [];

  const lojaLegReady =
    lojaTotal === 0
      ? paymentsPayload.length === 0
      : Math.abs(remaining) < 0.005 && paymentsPayload.every((p) => p.amount > 0);
  const canConfirm = lojaLegReady && tableLegReady && (cart.length > 0 || Boolean(consumptionSelection));

  function handleSubmit(formData: FormData) {
    if (!canConfirm) {
      setPaymentError(
        !tableLegReady
          ? "Selecione a forma de pagamento do consumo selecionado."
          : remaining > 0
            ? `Ainda falta receber ${formatBRLNumber(remaining)} da loja.`
            : "A soma das formas de pagamento da loja não pode passar do total.",
      );
      return;
    }
    setPaymentError(null);
    formAction(formData);
  }

  function handleConsumptionConfirm(selection: ConsumptionSelection | null) {
    setConsumptionSelection(selection);
    setTablePickerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden">
        {/* Sempre visível aqui, independente de já ter algo no carrinho —
            no celular, o painel de carrinho (onde este botão também
            aparece) só surge depois do primeiro item adicionado; sem isto
            aqui, não dava pra começar uma venda PELA mesa (correção
            encontrada testando o fluxo no navegador). */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTablePickerOpen(true)}
          className="w-full justify-center lg:hidden"
          data-testid="pdv-add-table-mobile"
        >
          <Table2 className="h-4 w-4" aria-hidden />
          {consumptionSelection
            ? `Alterar consumo — ${consumptionSelection.label}`
            : "+ Adicionar consumo de mesa ou retirada"}
        </Button>

        <SearchField
          value={search}
          onChange={setSearch}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar por nome, código ou código de barras"
          ariaLabel="Buscar produto"
          autoFocus
          className="lg:max-w-md"
        />

        <div
          role="tablist"
          aria-label="Filtrar produtos por categoria"
          className="flex flex-wrap gap-2 pb-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={categoryId === "all"}
            onClick={() => setCategoryId("all")}
            className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
              categoryId === "all"
                ? "bg-wine text-bg"
                : "border border-line text-ink hover:bg-ink/5"
            }`}
          >
            Todas
          </button>
          {categories.map((category) => {
            const isActive = category.id === categoryId;
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setCategoryId(category.id)}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                  isActive ? "bg-wine text-bg" : "border border-line text-ink hover:bg-ink/5"
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>

        {!shouldShowProducts ? (
          <EmptyState
            icon={ShoppingBag}
            title="Escolha uma categoria ou busque um produto para começar."
          />
        ) : filteredProducts.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Nenhum produto encontrado para esta busca." />
        ) : (
          <div className="grid grid-cols-2 gap-2.5 overflow-y-auto pb-24 sm:grid-cols-3 lg:min-h-0 lg:flex-1 lg:grid-cols-3 lg:content-start lg:pb-2">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addToCart(product)}
                className="group flex min-h-[84px] flex-col items-start justify-between gap-1 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-wine/40 active:bg-wine/5"
              >
                <span className="line-clamp-2 text-sm font-medium text-ink">{product.name}</span>
                <span className="flex w-full items-center justify-between">
                  <span className="tabular text-sm font-semibold text-gold-dark">
                    {formatBRLNumber(Number(product.price))}
                  </span>
                  <Plus
                    className="h-4 w-4 text-muted transition-colors group-hover:text-wine"
                    aria-hidden
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Carrinho — painel fixo à direita no desktop, barra flutuante +
          folha deslizante no celular (CLAUDE.md seção 11: evitar modal
          longo, manter total sempre visível). */}
      <div className="hidden lg:block lg:w-[420px] lg:shrink-0">
        <div className="lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col">
          <CartPanel
            cart={cart}
            consumptionSelection={consumptionSelection}
            total={grandTotal}
            itemCount={itemCount}
            onSetQuantity={setLineQuantity}
            onRemove={removeLine}
            onCheckout={openCheckout}
            onAddTable={() => setTablePickerOpen(true)}
            onRemoveTable={() => setConsumptionSelection(null)}
            onRequestClear={requestClear}
          />
        </div>
      </div>

      {(cart.length > 0 || consumptionSelection) && !cartSheetOpen && !checkoutOpen && (
        <button
          type="button"
          onClick={() => setCartSheetOpen(true)}
          className="fixed inset-x-4 bottom-20 z-20 flex h-14 items-center justify-between rounded-control bg-wine px-4 text-bg shadow-panel lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="h-4 w-4" aria-hidden />
            {itemCount} item(ns){consumptionSelection ? ` + ${consumptionSelection.label}` : ""}
          </span>
          <span className="tabular text-sm font-semibold">
            Ver carrinho · {formatBRLNumber(grandTotal)}
          </span>
        </button>
      )}

      {cartSheetOpen && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Fechar carrinho"
            onClick={() => setCartSheetOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="relative max-h-[85vh] overflow-y-auto rounded-t-panel bg-bg p-4 pb-6 shadow-panel">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Venda</h2>
              <IconButton
                label="Fechar carrinho"
                icon={X}
                onClick={() => setCartSheetOpen(false)}
              />
            </div>
            <CartPanel
              cart={cart}
              consumptionSelection={consumptionSelection}
              total={grandTotal}
              itemCount={itemCount}
              onSetQuantity={setLineQuantity}
              onRemove={removeLine}
              onCheckout={openCheckout}
              onAddTable={() => setTablePickerOpen(true)}
              onRemoveTable={() => setConsumptionSelection(null)}
              onRequestClear={requestClear}
              bare
            />
          </div>
        </div>
      )}

      {tablePickerOpen && (
        <ConsumptionPicker
          options={consumptionOptions}
          initialSelection={consumptionSelection}
          onConfirm={handleConsumptionConfirm}
          onClose={() => setTablePickerOpen(false)}
        />
      )}

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Cancelar venda em andamento?"
        description="Remove todos os itens e o consumo de mesa ou retirada adicionados até agora. Essa ação não pode ser desfeita."
        onCancel={() => setClearConfirmOpen(false)}
        confirmSlot={
          <Button variant="danger" onClick={confirmClear}>
            Cancelar venda
          </Button>
        }
      />

      {checkoutOpen && (
        <div className="fixed inset-0 z-40 flex flex-col items-center justify-end bg-ink/40 p-0 sm:justify-center sm:p-4">
          <div className="flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto rounded-t-panel bg-bg p-5 shadow-panel sm:max-w-md sm:rounded-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Receber</h2>
              <IconButton
                label="Fechar recebimento"
                icon={X}
                onClick={() => setCheckoutOpen(false)}
              />
            </div>

            <div className="flex items-baseline justify-between rounded-card bg-surface p-3.5">
              <span className="text-sm text-muted">Total da venda</span>
              <span
                data-testid="pdv-checkout-total"
                className="tabular text-2xl font-semibold text-ink"
              >
                {formatBRLNumber(grandTotal)}
              </span>
            </div>

            {consumptionSelection && (
              <div className="flex flex-col gap-2 rounded-card border border-line p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-ink">
                    {consumptionSelection.label}
                  </span>
                  <span className="tabular text-sm font-semibold text-ink">
                    {formatBRLNumber(tableTotal)}
                  </span>
                </div>
                <SelectField
                  // Distinto do "Forma de pagamento" da perna da loja
                  // (evita rótulo repetido quando só há uma forma de
                  // pagamento lá, sem índice) — mantém exatamente "...da
                  // mesa" pra sessão de mesa (texto já coberto por teste
                  // e2e), acrescenta "...da retirada" pro novo caso.
                  label={`Forma de pagamento da ${consumptionSelection.kind === "table" ? "mesa" : "retirada"}`}
                  name="tablePaymentMethodId"
                  value={tablePaymentMethodId}
                  onChange={(e) => setTablePaymentMethodId(e.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </SelectField>
              </div>
            )}

            {lojaTotal > 0 && (
              <div className="flex flex-col gap-3">
                {consumptionSelection && (
                  <h3 className="text-sm font-semibold text-ink">
                    Loja · {formatBRLNumber(lojaTotal)}
                  </h3>
                )}
                {paymentLines.map((line, index) => {
                  const cash = isCashMethod(line.paymentMethodId);
                  const received = parseBRLInput(line.cashReceivedInput);
                  const owed = parseBRLInput(line.amountInput);
                  const change = cash && received > owed ? round2(received - owed) : 0;
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-2 rounded-card border border-line p-3"
                    >
                      <div className="flex items-end gap-2">
                        <SelectField
                          label={`Forma de pagamento ${paymentLines.length > 1 ? index + 1 : ""}`}
                          name={`method-${line.key}`}
                          value={line.paymentMethodId}
                          onChange={(e) =>
                            updatePaymentLine(line.key, { paymentMethodId: e.target.value })
                          }
                          className="flex-1"
                        >
                          {paymentMethods.map((method) => (
                            <option key={method.id} value={method.id}>
                              {method.name}
                            </option>
                          ))}
                        </SelectField>
                        {paymentLines.length > 1 && (
                          <IconButton
                            label="Remover forma de pagamento"
                            icon={Trash2}
                            className="shrink-0 border border-line"
                            onClick={() => removePaymentLine(line.key)}
                          />
                        )}
                      </div>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-ink">Valor</span>
                        <div className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.amountInput}
                            onChange={(e) =>
                              updatePaymentLine(line.key, { amountInput: e.target.value })
                            }
                            className="tabular h-11 w-full rounded-control-sm border border-line bg-surface pl-10 text-right text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
                          />
                        </div>
                      </label>

                      {cash && (
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium text-ink">
                            Recebido em dinheiro (opcional, só para calcular o troco)
                          </span>
                          <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                              R$
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.cashReceivedInput}
                              onChange={(e) =>
                                updatePaymentLine(line.key, { cashReceivedInput: e.target.value })
                              }
                              className="tabular h-11 w-full rounded-control-sm border border-line bg-surface pl-10 text-right text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
                            />
                          </div>
                          {change > 0 && (
                            <p className="tabular text-sm font-semibold text-free-dark">
                              Troco: {formatBRLNumber(change)}
                            </p>
                          )}
                        </label>
                      )}
                    </div>
                  );
                })}

                <Button variant="outline" size="sm" onClick={addPaymentLine} className="self-start">
                  + Adicionar forma de pagamento
                </Button>
              </div>
            )}

            <div
              className={`rounded-card p-3 text-center text-sm font-semibold ${
                canConfirm ? "bg-free/10 text-free-dark" : "bg-gold/15 text-gold-dark"
              }`}
            >
              {!tableLegReady
                ? "Selecione a forma de pagamento do consumo selecionado."
                : canConfirm
                  ? "Valor confere com o total da venda."
                  : remaining > 0
                    ? `Falta receber ${formatBRLNumber(remaining)} da loja.`
                    : `Soma da loja maior que o total. Ajuste os valores.`}
            </div>

            <form action={(formData) => handleSubmit(formData)} className="flex flex-col gap-2">
              <input type="hidden" name="orderIdempotencyKey" value={orderIdempotencyKey} />
              <input type="hidden" name="cartJson" value={JSON.stringify(cartPayload)} />
              <input type="hidden" name="paymentsJson" value={JSON.stringify(paymentsPayload)} />
              {consumptionSelection && (
                <>
                  <input
                    type="hidden"
                    name="combinedIdempotencyKey"
                    value={combinedIdempotencyKey}
                  />
                  {/* Nomes "table*" mantidos de propósito (ADR 0010) mesmo
                      cobrindo retirada agora — registerCombinedCheckout
                      (aplicação) e registerCombinedCheckoutAction (server
                      action) já tratam isto como "qualquer ServiceSession
                      em aberto", nunca validaram contra type: "TABLE".
                      redirectPath é a rota certa pra revalidar depois
                      (mesa ou retirada, actions.ts decide com base nela). */}
                  <input type="hidden" name="tableSessionId" value={consumptionSelection.sessionId} />
                  <input type="hidden" name="redirectPath" value={consumptionSelection.redirectPath} />
                  <input type="hidden" name="tablePaymentMethodId" value={tablePaymentMethodId} />
                  <input
                    type="hidden"
                    name="tablePaymentIdempotencyKey"
                    value={tablePaymentIdempotencyKey}
                  />
                  <input
                    type="hidden"
                    name="tableAllocationsJson"
                    value={JSON.stringify(tableAllocationsPayload)}
                  />
                </>
              )}
              {(paymentError ?? state.error) && (
                <p role="alert" className="text-sm text-wine">
                  {paymentError ?? state.error}
                </p>
              )}
              <SubmitButton pendingLabel="Registrando venda..." disabled={!canConfirm}>
                Confirmar venda
              </SubmitButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CartPanel({
  cart,
  consumptionSelection,
  total,
  itemCount,
  onSetQuantity,
  onRemove,
  onCheckout,
  onAddTable,
  onRemoveTable,
  onRequestClear,
  bare = false,
}: {
  cart: CartLine[];
  consumptionSelection: ConsumptionSelection | null;
  total: number;
  itemCount: number;
  onSetQuantity: (key: string, quantityInput: string) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
  onAddTable: () => void;
  onRemoveTable: () => void;
  onRequestClear: () => void;
  bare?: boolean;
}) {
  const isEmpty = cart.length === 0 && !consumptionSelection;

  const content = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {!bare && (
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Venda</h2>
          <span data-testid="pdv-cart-item-count" className="text-sm text-muted">
            {itemCount} item(ns)
          </span>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={onAddTable}
        className="w-full justify-center"
        data-testid="pdv-add-table-desktop"
      >
        <Table2 className="h-4 w-4" aria-hidden />
        {consumptionSelection ? "Alterar consumo" : "+ Adicionar consumo de mesa ou retirada"}
      </Button>

      {consumptionSelection && (
        <div className="flex items-center justify-between gap-2 rounded-card border border-wine/30 bg-wine/5 p-2.5">
          <div>
            <div data-testid="pdv-cart-table-chip" className="text-sm font-medium text-ink">
              {consumptionSelection.label}
            </div>
            <div className="tabular text-xs text-muted">
              {formatBRLNumber(consumptionSelection.totalCents / 100)}
            </div>
          </div>
          <IconButton label="Remover consumo selecionado" icon={Trash2} onClick={onRemoveTable} />
        </div>
      )}

      {isEmpty ? (
        <EmptyState icon={ShoppingCart} title="Toque num produto para adicionar à venda." />
      ) : (
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto lg:flex-1">
          {cart.map((line) => (
            <li
              key={line.key}
              className="flex flex-col gap-2 rounded-card border border-line p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{line.productName}</div>
                  <div className="tabular text-xs text-muted">
                    {formatBRLNumber(line.unitPrice)} cada
                  </div>
                </div>
                <IconButton
                  label={`Remover ${line.productName}`}
                  icon={Trash2}
                  onClick={() => onRemove(line.key)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <QuantityStepper
                  value={String(line.quantity)}
                  onChange={(next) => onSetQuantity(line.key, next)}
                  ariaLabel={`Quantidade de ${line.productName}`}
                />
                <span className="tabular text-sm font-semibold text-ink">
                  {formatBRLNumber(line.unitPrice * line.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm font-medium text-ink">Total</span>
        <span
          data-testid="pdv-cart-total"
          className="tabular text-xl font-semibold text-ink"
        >
          {formatBRLNumber(total)}
        </span>
      </div>

      <div className="flex gap-2">
        {/* "Cancelar venda" — mesma ideia do CANCELAR (F9) do PDV do
            VHSYS: limpa tudo de uma vez, em vez de item por item. */}
        <Button variant="danger" onClick={onRequestClear} disabled={isEmpty} className="flex-1">
          Cancelar venda
        </Button>
        <Button onClick={onCheckout} disabled={isEmpty} className="flex-[2]">
          Receber
        </Button>
      </div>
    </div>
  );

  return bare ? (
    content
  ) : (
    <Card className="flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">{content}</Card>
  );
}
