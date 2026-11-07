"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingBag, ShoppingCart, Table2, Tag, Trash2, X } from "lucide-react";
import { SelectField, TextField } from "@/components/form/field";
import { MaskedMoneyInput } from "@/components/form/masked-money-input";
import { QuantityStepper } from "@/components/form/quantity-stepper";
import { SearchField } from "@/components/form/search-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import {
  decodeScaleBarcode,
  matchesEmbeddedProductCode,
  type ScaleBarcodeLayout,
} from "@/domain/pdv/scale-barcode-decode";
import { registerCombinedCheckoutAction, sellPdvAction, type FormState } from "./actions";
import {
  ConsumptionPicker,
  type ConsumptionOption,
  type ConsumptionSelection,
} from "./table-consumption-picker";
import { WeightPromptDialog } from "./weight-prompt-dialog";
import { WeightPriceOverrideDialog } from "./weight-price-override-dialog";

type ProductOption = {
  id: string;
  name: string;
  price: string;
  sku: string | null;
  barcode: string | null;
  // "UN" (padrão) ou "KG" — produto por quilo (pedido do usuário,
  // 2026-11-07): price vira preço por kg, e só este tipo de produto aceita
  // peso (leitura de balança ou digitado na mão via WeightPromptDialog).
  unit: string;
  categoryId: string;
  categoryName: string;
};
type PaymentMethodOption = { id: string; name: string };
type CartLine = {
  key: string;
  productId: string;
  productName: string;
  // Preço por unidade (R$/un) OU por quilo (R$/kg) quando isWeight — nos
  // dois casos, unitPrice × quantity já é o total da linha, então todo o
  // resto do carrinho (soma, formatação) funciona sem precisar saber qual
  // dos dois é. Pode ser menor que catalogUnitPrice quando a linha tem
  // preço promocional aplicado (WeightPriceOverrideDialog, só pra peso).
  unitPrice: number;
  // Preço de tabela no momento em que o item entrou no carrinho — nunca
  // muda depois; é o teto do diálogo de preço promocional (nunca deixa
  // aplicar um preço maior que o de tabela) e a referência pra saber se a
  // linha está com desconto (unitPrice < catalogUnitPrice).
  catalogUnitPrice: number;
  // Contagem de unidades OU peso em kg quando isWeight.
  quantity: number;
  isWeight: boolean;
  // Motivo do preço promocional (opcional) — só preenchido quando
  // unitPrice < catalogUnitPrice; vai pra auditoria no servidor.
  weightPriceOverrideReason?: string;
};

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatWeightKg(kg: number): string {
  return `${kg.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
}
// Um único campo "Valor recebido" por forma de pagamento (pedido do
// usuário, 2026-11-06 — antes eram dois campos, "Valor" e "Recebido em
// dinheiro", mesmo em cartão/PIX onde o segundo nunca fazia sentido).
// Em centavos (inteiro) — mesma unidade de ConsumptionSelection.totalCents
// — evita todo o round2/parseBRLInput que o modelo anterior precisava só
// pra contornar imprecisão de ponto flutuante.
type PaymentLine = {
  key: string;
  idempotencyKey: string;
  paymentMethodId: string;
  receivedCents: number;
};

const initialState: FormState = { error: null };

function formatBRLNumber(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCents(cents: number): string {
  return formatBRLNumber(cents / 100);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function newPaymentLine(paymentMethodId: string, receivedCents: number): PaymentLine {
  return {
    key: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    paymentMethodId,
    receivedCents,
  };
}

// Quanto cada linha realmente abate do total (nunca mais que o que ainda
// falta na hora dela, processando em ordem) e quanto sobra de troco —
// só dinheiro pode gerar troco (pedido do usuário: cartão/PIX sempre
// cobra exatamente o valor digitado, sem "sobra"). Cartão/PIX que
// digitar a mais que o necessário conta inteiro mesmo assim — vira
// "soma maior que o total" lá na validação, não troco.
function computePaymentCredits(
  lines: PaymentLine[],
  targetCents: number,
  isCash: (paymentMethodId: string) => boolean,
): { creditedCents: number; changeCents: number }[] {
  let remaining = targetCents;
  return lines.map((line) => {
    if (isCash(line.paymentMethodId)) {
      const credited = Math.min(line.receivedCents, Math.max(remaining, 0));
      remaining -= credited;
      return { creditedCents: credited, changeCents: Math.max(0, line.receivedCents - credited) };
    }
    remaining -= line.receivedCents;
    return { creditedCents: line.receivedCents, changeCents: 0 };
  });
}

export function PdvSaleScreen({
  restaurantId,
  products,
  paymentMethods,
  consumptionOptions,
  scaleBarcodeLayout,
}: {
  restaurantId: string;
  products: ProductOption[];
  paymentMethods: PaymentMethodOption[];
  consumptionOptions: ConsumptionOption[];
  // null = leitura de balança desligada em /admin/configuracoes (ou nunca
  // configurada) — scan sempre cai no casamento comum por SKU/código de
  // barras inteiro, igual antes desta etapa existir.
  scaleBarcodeLayout: ScaleBarcodeLayout | null;
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
  // Produto "KG" tocado na grade, aguardando o peso ser digitado
  // (WeightPromptDialog) — null = nenhum diálogo de peso aberto.
  const [weightPromptProduct, setWeightPromptProduct] = useState<ProductOption | null>(null);
  // Linha de peso com o diálogo de preço promocional aberto
  // (WeightPriceOverrideDialog) — null = nenhum diálogo de preço aberto.
  const [priceOverrideLineKey, setPriceOverrideLineKey] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  // Desconto da perna da loja (pedido do usuário, 2026-11-06) — sempre
  // valor fixo em R$, nunca percentual. Motivo só aparece/é exigido
  // quando tem desconto de verdade (regra 14 do CLAUDE.md), mesma
  // exigência que já vale pro desconto de mesa.
  const [discountCents, setDiscountCents] = useState(0);
  const [discountReason, setDiscountReason] = useState("");

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
      setDiscountCents(0);
      setDiscountReason("");
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

  // `isWeight`: produto por quilo (WeightPromptDialog ou scan decodificado
  // da balança) — `quantity` entra como peso em kg, não contagem.
  // Reaproveita o mesmo produto já no carrinho somando o peso (duas
  // pesagens da mesma picanha numa venda só viram uma linha de 0,770kg),
  // igual ao que já acontecia somando contagem de produto normal.
  function addToCart(product: ProductOption, quantity = 1, opts?: { isWeight?: boolean }) {
    const isWeight = opts?.isWeight ?? false;
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        return prev.map((line) =>
          line.key === existing.key
            ? {
                ...line,
                quantity: isWeight ? roundTo3(line.quantity + quantity) : line.quantity + quantity,
              }
            : line,
        );
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          unitPrice: Number(product.price),
          catalogUnitPrice: Number(product.price),
          quantity,
          isWeight,
        },
      ];
    });
  }

  // Preço promocional por kg (pedido do usuário, 2026-11-08) — aplica na
  // linha já existente, sem recriar o item nem mexer no peso.
  function applyWeightPriceOverride(key: string, priceCents: number, reason: string) {
    setCart((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, unitPrice: priceCents / 100, weightPriceOverrideReason: reason }
          : line,
      ),
    );
    setPriceOverrideLineKey(null);
  }

  // Só pra linha normal (contagem) — linha por peso não usa o
  // QuantityStepper (ver CartPanel), corrigir o peso é remover e
  // escanear/digitar de novo, mais confiável do que editar dígito a
  // dígito num campo pensado pra contagem inteira.
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
    setDiscountCents(0);
    setDiscountReason("");
    setClearConfirmOpen(false);
  }

  // Leitor de código de barras USB/Bluetooth funciona como teclado: digita
  // rápido e manda Enter. Casamento exato em código de barras ou SKU
  // adiciona direto ao carrinho, sem precisar tocar no card (pedido
  // original: "busca por nome/código/código de barras").
  //
  // Leitura da balança (pedido do usuário, 2026-11-07): tentada primeiro,
  // só quando a config está ligada (scaleBarcodeLayout não nulo) — o
  // código embutido (trecho interno do código de barras inteiro) nunca
  // bate por acaso com um SKU/código de barras comum, então decodificou
  // com sucesso nunca cai no caminho de baixo, decodificou mas não achou
  // o produto também não cai (evita somar "1 unidade" de um produto por
  // quilo sem peso nenhum).
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const raw = search.trim();
    if (!raw) return;

    if (scaleBarcodeLayout) {
      const decoded = decodeScaleBarcode(raw, scaleBarcodeLayout);
      if (decoded) {
        event.preventDefault();
        const product = products.find(
          (p) => p.unit === "KG" && matchesEmbeddedProductCode(p.sku, decoded.productCode),
        );
        if (!product) {
          showToast("Produto da balança não encontrado. Confira o SKU cadastrado.");
          return;
        }
        const pricePerKg = Number(product.price);
        const decodedValue = Number(decoded.value.toString());
        const weightKg =
          decoded.valueType === "WEIGHT"
            ? decodedValue
            : pricePerKg > 0
              ? decodedValue / pricePerKg
              : 0;
        if (weightKg <= 0) {
          showToast(`"${product.name}" não tem preço cadastrado para calcular o peso.`);
          return;
        }
        addToCart(product, roundTo3(weightKg), { isWeight: true });
        setSearch("");
        showToast(`${product.name} adicionado (${formatWeightKg(roundTo3(weightKg))}).`);
        return;
      }
    }

    const query = raw.toLowerCase();
    // Produto "KG" nunca entra pelo casamento exato comum — sem peso, uma
    // unidade ao preço por quilo confundiria o valor da venda; produto por
    // quilo só entra via leitura da balança (acima) ou pelo diálogo de
    // peso manual (toque no card).
    const exact = products.find(
      (product) =>
        product.unit !== "KG" &&
        (product.barcode?.toLowerCase() === query || product.sku?.toLowerCase() === query),
    );
    if (exact) {
      event.preventDefault();
      addToCart(exact);
      setSearch("");
      showToast(`${exact.name} adicionado.`);
    }
  }

  const lojaTotalCents = Math.round(
    cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) * 100,
  );
  const tableTotal = round2((consumptionSelection?.totalCents ?? 0) / 100);
  // Nunca passa do subtotal da loja (mesmo clamp do servidor,
  // sell-pdv.ts) — evita mostrar "desconto maior que a venda" na tela
  // mesmo que a pessoa digite um valor absurdo.
  const discountCentsClamped = Math.min(discountCents, lojaTotalCents);
  const lojaTargetCents = Math.max(0, lojaTotalCents - discountCentsClamped);
  const grandTotal = round2(lojaTargetCents / 100 + tableTotal);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

  function isCashMethod(paymentMethodId: string): boolean {
    const method = paymentMethods.find((m) => m.id === paymentMethodId);
    return (method?.name ?? "").toLowerCase().includes("dinheiro");
  }

  // Quanto ainda falta pra fechar a perna da loja, sem contar a própria
  // linha `excludeKey` — usado tanto pra pré-preencher uma linha nova
  // quanto pra reajustar quando a forma de pagamento de uma linha já
  // existente muda (cartão/PIX/débito "já preenche com o valor total da
  // conta", pedido do usuário).
  function remainingCentsExcluding(excludeKey: string | null): number {
    const relevant = paymentLines.filter((l) => l.key !== excludeKey);
    const credited = computePaymentCredits(relevant, lojaTargetCents, isCashMethod).reduce(
      (sum, c) => sum + c.creditedCents,
      0,
    );
    return Math.max(0, lojaTargetCents - credited);
  }

  const paymentCredits = computePaymentCredits(paymentLines, lojaTargetCents, isCashMethod);
  const totalCreditedCents = paymentCredits.reduce((sum, c) => sum + c.creditedCents, 0);
  const remainingCents = lojaTargetCents - totalCreditedCents;
  const tableLegReady = !consumptionSelection || Boolean(tablePaymentMethodId);
  // Desconto cobrindo a venda inteira (caso raro — o campo é pra
  // "tirar os centavos" ou um desconto pontual, não pra zerar a venda):
  // não dá pra fechar sem nenhuma forma de pagamento, e o servidor
  // sempre exige ao menos uma. Mensagem clara em vez de deixar tentar e
  // falhar no fim.
  const fullyDiscounted = lojaTotalCents > 0 && lojaTargetCents === 0;

  function openCheckout() {
    if (cart.length === 0 && !consumptionSelection) return;
    const methodId = paymentMethods[0]?.id ?? "";
    setPaymentLines(
      lojaTotalCents > 0
        ? [newPaymentLine(methodId, isCashMethod(methodId) ? 0 : lojaTotalCents)]
        : [],
    );
    setDiscountCents(0);
    setDiscountReason("");
    setTablePaymentMethodId(paymentMethods[0]?.id ?? "");
    setPaymentError(null);
    setCheckoutOpen(true);
    setCartSheetOpen(false);
  }

  function addPaymentLine() {
    const methodId = paymentMethods[0]?.id ?? "";
    const prefill = isCashMethod(methodId) ? 0 : remainingCentsExcluding(null);
    setPaymentLines((prev) => [...prev, newPaymentLine(methodId, prefill)]);
  }

  function removePaymentLine(key: string) {
    setPaymentLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev));
  }

  function updatePaymentLine(key: string, patch: Partial<PaymentLine>) {
    setPaymentLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  // Trocar a forma de pagamento de uma linha já existente também
  // repreenche o valor — cartão/PIX/débito pro que falta, dinheiro
  // volta em branco pra pessoa digitar (pedido do usuário).
  function changePaymentMethod(key: string, paymentMethodId: string) {
    const prefill = isCashMethod(paymentMethodId) ? 0 : remainingCentsExcluding(key);
    updatePaymentLine(key, { paymentMethodId, receivedCents: prefill });
  }

  const paymentsPayload = paymentLines
    .map((line, index) => {
      const { creditedCents } = paymentCredits[index] ?? { creditedCents: 0, changeCents: 0 };
      const isCash = isCashMethod(line.paymentMethodId);
      return {
        paymentMethodId: line.paymentMethodId,
        amount: round2(creditedCents / 100),
        idempotencyKey: line.idempotencyKey,
        // Só para o recibo (troco impresso) — nunca usado pra validar
        // nem gravar o pagamento em si (decisão do usuário, visão da
        // Fase 2). O valor recebido de verdade, não o que foi
        // creditado — createPdvSaleReceiptPrintJob calcula o troco como
        // recebido menos cobrado.
        ...(isCash && line.receivedCents > 0 ? { cashReceived: round2(line.receivedCents / 100) } : {}),
      };
    })
    .filter((p) => p.amount > 0);
  const cartPayload = cart.map((line) =>
    line.isWeight
      ? {
          productId: line.productId,
          quantity: 1,
          weightQuantity: line.quantity,
          // Preço promocional (pedido do usuário, 2026-11-08) — só manda
          // quando a linha de fato está abaixo do preço de tabela
          // (aplicou o diálogo); createOrderInTx revalida de novo que
          // nunca passa do preço de tabela.
          ...(line.unitPrice < line.catalogUnitPrice
            ? {
                weightUnitPriceOverride: line.unitPrice,
                weightUnitPriceOverrideReason: line.weightPriceOverrideReason,
              }
            : {}),
        }
      : { productId: line.productId, quantity: line.quantity },
  );
  const tableAllocationsPayload = consumptionSelection?.entries.map((entry) => entry.payload) ?? [];

  const lojaLegReady =
    lojaTotalCents === 0
      ? paymentsPayload.length === 0
      : !fullyDiscounted && remainingCents === 0;
  const canConfirm = lojaLegReady && tableLegReady && (cart.length > 0 || Boolean(consumptionSelection));

  function handleSubmit(formData: FormData) {
    if (!canConfirm) {
      setPaymentError(
        !tableLegReady
          ? "Selecione a forma de pagamento do consumo selecionado."
          : fullyDiscounted
            ? "O desconto cobre a venda inteira. Reduza o valor pra confirmar."
            : remainingCents > 0
              ? `Ainda falta receber ${formatCents(remainingCents)} da loja.`
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
                onClick={() =>
                  product.unit === "KG" ? setWeightPromptProduct(product) : addToCart(product)
                }
                className="group flex min-h-[84px] flex-col items-start justify-between gap-1 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:border-wine/40 active:bg-wine/5"
              >
                <span className="line-clamp-2 text-sm font-medium text-ink">{product.name}</span>
                <span className="flex w-full items-center justify-between">
                  <span className="tabular text-sm font-semibold text-gold-dark">
                    {formatBRLNumber(Number(product.price))}
                    {product.unit === "KG" ? "/kg" : ""}
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
            onEditWeightPrice={(key) => setPriceOverrideLineKey(key)}
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
          {/* Cantos arredondados e rolagem separados — mesmo motivo do
              diálogo "Receber" abaixo (relato do usuário, 2026-11-06):
              overflow-y-auto e rounded-* no mesmo elemento deixa a barra
              de rolagem "quadrar" o canto onde ela aparece. `relative`
              aqui (não no elemento de dentro) é essencial — sem ele, esta
              folha some atrás do botão `absolute` do fundo escurecido
              acima (um elemento posicionado sempre pinta por cima de um
              não-posicionado com z-index:auto, mesmo vindo depois no
              DOM): achado ao mover `relative` sem querer pro elemento
              errado nesta mesma correção, relatado pelo usuário como "a
              cor do carrinho ficou esquisita, misturada com o fundo". */}
          <div className="relative flex max-h-[85vh] flex-col overflow-hidden rounded-t-panel bg-bg shadow-panel">
            <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-6">
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
                onEditWeightPrice={(key) => setPriceOverrideLineKey(key)}
                onCheckout={openCheckout}
                onAddTable={() => setTablePickerOpen(true)}
                onRemoveTable={() => setConsumptionSelection(null)}
                onRequestClear={requestClear}
                bare
              />
            </div>
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

      {weightPromptProduct && (
        <WeightPromptDialog
          productName={weightPromptProduct.name}
          onConfirm={(weightKg) => {
            addToCart(weightPromptProduct, weightKg, { isWeight: true });
            setWeightPromptProduct(null);
          }}
          onClose={() => setWeightPromptProduct(null)}
        />
      )}

      {priceOverrideLineKey &&
        (() => {
          const line = cart.find((l) => l.key === priceOverrideLineKey);
          if (!line) return null;
          return (
            <WeightPriceOverrideDialog
              productName={line.productName}
              catalogPriceCents={Math.round(line.catalogUnitPrice * 100)}
              initialPriceCents={Math.round(line.unitPrice * 100)}
              onConfirm={(priceCents, reason) =>
                applyWeightPriceOverride(line.key, priceCents, reason)
              }
              onClose={() => setPriceOverrideLineKey(null)}
            />
          );
        })()}

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
          {/* Cantos arredondados e rolagem em elementos separados (relato
              do usuário, 2026-11-06: lado direito ficava reto, lado
              esquerdo curvo) — com overflow-y-auto e rounded-* no MESMO
              elemento, a barra de rolagem nativa "quadra" o canto onde
              ela aparece, em vez de respeitar a borda arredondada. O de
              fora só corta (overflow-hidden) e arredonda; quem rola é o
              de dentro, sem borda própria. */}
          <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-panel bg-bg shadow-panel sm:max-w-md sm:rounded-panel">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
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

            {lojaTotalCents > 0 && (
              <div className="flex flex-col gap-3">
                {consumptionSelection && (
                  <h3 className="text-sm font-semibold text-ink">
                    Loja · {formatCents(lojaTotalCents)}
                  </h3>
                )}

                {/* Desconto (pedido do usuário, 2026-11-06) — sempre valor
                    fixo em R$, nunca percentual. Só se aplica à perna da
                    loja, nunca ao consumo de mesa/retirada (que já tem seu
                    próprio desconto na tela de fechamento da mesa). */}
                <div className="flex flex-col gap-2 rounded-card border border-dashed border-line p-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink">Desconto</span>
                    <MaskedMoneyInput
                      valueCents={discountCentsClamped}
                      onChangeCents={(cents) => setDiscountCents(Math.min(cents, lojaTotalCents))}
                      ariaLabel="Desconto"
                    />
                  </label>
                  {discountCentsClamped > 0 && (
                    <>
                      <TextField
                        label="Motivo do desconto"
                        name="discountReasonInput"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        maxLength={300}
                        hint="Vai pra auditoria, igual ao desconto de mesa."
                      />
                      <p className="tabular text-xs text-muted">
                        Subtotal {formatCents(lojaTotalCents)} − desconto{" "}
                        {formatCents(discountCentsClamped)} = total a receber da loja{" "}
                        <span className="font-semibold text-ink">{formatCents(lojaTargetCents)}</span>
                      </p>
                    </>
                  )}
                </div>

                {paymentLines.map((line, index) => {
                  const cash = isCashMethod(line.paymentMethodId);
                  const { changeCents } = paymentCredits[index] ?? { creditedCents: 0, changeCents: 0 };
                  return (
                    <div
                      key={line.key}
                      className="flex flex-col gap-2 rounded-card border border-line p-3"
                    >
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <SelectField
                            label={`Forma de pagamento ${paymentLines.length > 1 ? index + 1 : ""}`}
                            name={`method-${line.key}`}
                            value={line.paymentMethodId}
                            onChange={(e) => changePaymentMethod(line.key, e.target.value)}
                            className="w-full"
                          >
                            {paymentMethods.map((method) => (
                              <option key={method.id} value={method.id}>
                                {method.name}
                              </option>
                            ))}
                          </SelectField>
                        </div>
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
                        <span className="text-sm font-medium text-ink">Valor recebido</span>
                        <MaskedMoneyInput
                          valueCents={line.receivedCents}
                          onChangeCents={(cents) =>
                            updatePaymentLine(line.key, { receivedCents: cents })
                          }
                          ariaLabel={`Valor recebido ${paymentLines.length > 1 ? index + 1 : ""}`}
                        />
                      </label>

                      {cash && changeCents > 0 && (
                        <p className="tabular text-sm font-semibold text-free-dark">
                          Troco: {formatCents(changeCents)}
                        </p>
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
                : fullyDiscounted
                  ? "O desconto cobre a venda inteira. Reduza o valor pra confirmar."
                  : canConfirm
                    ? "Valor confere com o total da venda."
                    : remainingCents > 0
                      ? `Falta receber ${formatCents(remainingCents)} da loja.`
                      : `Soma da loja maior que o total. Ajuste os valores.`}
            </div>

            <form action={(formData) => handleSubmit(formData)} className="flex flex-col gap-2">
              <input type="hidden" name="orderIdempotencyKey" value={orderIdempotencyKey} />
              <input type="hidden" name="cartJson" value={JSON.stringify(cartPayload)} />
              <input type="hidden" name="paymentsJson" value={JSON.stringify(paymentsPayload)} />
              {discountCentsClamped > 0 && (
                <>
                  <input
                    type="hidden"
                    name="discountValue"
                    value={(discountCentsClamped / 100).toFixed(2)}
                  />
                  <input type="hidden" name="discountReason" value={discountReason} />
                </>
              )}
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
  onEditWeightPrice,
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
  onEditWeightPrice: (key: string) => void;
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
              {(() => {
                // Preço promocional aplicado (pedido do usuário,
                // 2026-11-08) — só possível em linha de peso.
                const hasPriceOverride = line.isWeight && line.unitPrice < line.catalogUnitPrice;
                return (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">
                          {line.productName}
                        </div>
                        <div className="tabular text-xs text-muted">
                          {hasPriceOverride && (
                            <span className="mr-1 line-through">
                              {formatBRLNumber(line.catalogUnitPrice)}
                            </span>
                          )}
                          {formatBRLNumber(line.unitPrice)} {line.isWeight ? "/kg" : "cada"}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {line.isWeight && (
                          <IconButton
                            label={`Alterar preço por quilo de ${line.productName}`}
                            icon={Tag}
                            onClick={() => onEditWeightPrice(line.key)}
                          />
                        )}
                        <IconButton
                          label={`Remover ${line.productName}`}
                          icon={Trash2}
                          onClick={() => onRemove(line.key)}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {line.isWeight ? (
                        <span className="tabular rounded-control-sm bg-ink/5 px-3 py-2 text-sm font-medium text-ink">
                          {formatWeightKg(line.quantity)}
                        </span>
                      ) : (
                        <QuantityStepper
                          value={String(line.quantity)}
                          onChange={(next) => onSetQuantity(line.key, next)}
                          ariaLabel={`Quantidade de ${line.productName}`}
                        />
                      )}
                      <span className="tabular text-sm font-semibold text-ink">
                        {formatBRLNumber(line.unitPrice * line.quantity)}
                      </span>
                    </div>
                  </>
                );
              })()}
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
