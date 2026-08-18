"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Receipt, SplitSquareHorizontal } from "lucide-react";
import { SelectField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { registerItemPaymentAction, setItemShareAction, type FormState } from "./actions";
import type {
  ClientPayableLine,
  ClientShare,
  ClientSingleLine,
  ClientUnitsLine,
} from "./payment-selection-lines";

type PaymentMethodOption = { id: string; name: string };
type GuestOption = { id: string; name: string };

type CartEntry = {
  key: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  amountCents: number;
  payload:
    | { type: "UNITS"; orderItemIds: string[]; quantity: number }
    | { type: "AMOUNT"; orderItemIds: string[]; mode: "FULL" }
    | { type: "AMOUNT"; orderItemIds: string[]; mode: "SHARE"; parts: number }
    | { type: "AMOUNT"; orderItemIds: string[]; mode: "CUSTOM"; amount: number };
};

const initialState: FormState = { error: null };

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006). O
// "carrinho" aqui é puramente local (React state) até o envio final —
// nada é gravado enquanto o operador está montando a seleção (regra
// confirmada com o usuário: "seleção não significa pagamento"). Só ao
// confirmar em "Registrar pagamento" é que vira Payment +
// PaymentItemAllocation, numa transação só, e o servidor revalida tudo de
// novo contra o banco (regra 24) — o que está aqui é só uma proposta.
export function PaymentSelectionForm({
  redirectPath,
  sessionId,
  lines,
  paymentMethods,
  guests,
  guestCount,
  balance,
}: {
  redirectPath: string;
  sessionId: string;
  lines: ClientPayableLine[];
  paymentMethods: PaymentMethodOption[];
  guests: GuestOption[];
  // Quantidade de pessoas do atendimento — sugestão inicial de "em
  // quantas partes dividir" (pedido do usuário 2026-08-16: partir do
  // número de pessoas informado na mesa, não de um valor fixo).
  guestCount: number;
  balance: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = registerItemPaymentAction.bind(null, redirectPath, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Pagamento registrado.");
      router.push(`${redirectPath}/pagamentos`);
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success, redirectPath]);

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [guestId, setGuestId] = useState("");

  const cartByKey = useMemo(() => new Map(cart.map((entry) => [entry.key, entry])), [cart]);

  // Se todo mundo no carrinho é da mesma pessoa, sugere ela como
  // responsável do pagamento — o operador continua livre para trocar ou
  // deixar em branco (associação nunca é obrigatória).
  useEffect(() => {
    const guestIds = new Set(cart.map((entry) => entry.guestId).filter((id): id is string => id !== null));
    if (guestIds.size === 1) setGuestId((current) => current || [...guestIds][0]!);
  }, [cart]);

  function upsertEntry(entry: CartEntry) {
    setCart((prev) => [...prev.filter((e) => e.key !== entry.key), entry]);
  }

  function removeEntry(key: string) {
    setCart((prev) => prev.filter((e) => e.key !== key));
  }

  const totalCents = cart.reduce((sum, entry) => sum + entry.amountCents, 0);

  const allocationsPayload = cart.map((entry) => entry.payload);

  return (
    <div className="flex flex-col gap-6 pb-4">
      {lines.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhum item em aberto para selecionar. Use o pagamento sem detalhar itens."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-base font-semibold text-ink">Itens em aberto</h2>
          <ul className="flex flex-col gap-2">
            {lines.map((line) =>
              line.type === "units" ? (
                <UnitsLineCard
                  key={line.key}
                  line={line}
                  redirectPath={redirectPath}
                  defaultParts={guestCount}
                  cartEntry={cartByKey.get(line.key)}
                  onChange={upsertEntry}
                  onRemove={removeEntry}
                />
              ) : (
                <SingleLineCard
                  key={line.key}
                  line={line}
                  redirectPath={redirectPath}
                  defaultParts={guestCount}
                  cartEntry={cartByKey.get(line.key)}
                  onChange={upsertEntry}
                  onRemove={removeEntry}
                />
              ),
            )}
          </ul>
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Pagamento atual ({cart.length} item(ns))
        </h2>
        {cart.length === 0 ? (
          <p className="text-sm text-muted">Selecione acima o que esta pessoa está pagando.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {cart.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-2">
                <span className="text-ink">
                  {entry.label}
                  {entry.guestName && <span className="text-muted"> · {entry.guestName}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular font-medium text-ink">{formatCentsBRL(entry.amountCents)}</span>
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.key)}
                    className="text-xs font-medium text-wine underline underline-offset-2"
                  >
                    Remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="tabular border-t border-line pt-2 text-base font-semibold text-ink">
          Total a receber: {formatCentsBRL(totalCents)}
        </p>
      </Card>

      {cart.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-base font-semibold text-ink">Recebimento</h2>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="allocationsJson" value={JSON.stringify(allocationsPayload)} />
            <SelectField
              label="Forma de pagamento"
              name="paymentMethodId"
              required
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
            >
              <option value="" disabled>
                Selecione
              </option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </SelectField>
            {guests.length > 0 && (
              <SelectField
                label="Pessoa (opcional, em branco = pagamento geral)"
                name="guestId"
                value={guestId}
                onChange={(e) => setGuestId(e.target.value)}
              >
                <option value="">Pagamento geral da mesa</option>
                {guests.map((guest) => (
                  <option key={guest.id} value={guest.id}>
                    {guest.name}
                  </option>
                ))}
              </SelectField>
            )}
            <p className="text-xs text-muted">Saldo em aberto da conta: {balance ? formatCentsBRL(Math.round(Number(balance) * 100)) : "R$ 0,00"}</p>
            {state.error && (
              <p role="alert" className="text-sm text-wine">
                {state.error}
              </p>
            )}
            <SubmitButton pendingLabel="Registrando..." disabled={!paymentMethodId}>
              Registrar pagamento
            </SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

function UnitsLineCard({
  line,
  redirectPath,
  defaultParts,
  cartEntry,
  onChange,
  onRemove,
}: {
  line: ClientUnitsLine;
  redirectPath: string;
  defaultParts: number;
  cartEntry?: CartEntry;
  onChange: (entry: CartEntry) => void;
  onRemove: (key: string) => void;
}) {
  // Sempre começa zerado (pedido do usuário 2026-08-15: mostrar "1" sem
  // nada no carrinho confundia, parecia que já tinha 1 selecionado). Só
  // reflete o que já está de fato no carrinho.
  const alreadySelected = cartEntry?.payload.type === "UNITS" ? cartEntry.payload.quantity : 0;
  const [quantity, setQuantity] = useState(alreadySelected);
  // Seleção por unidade e "Dividir" disputam a mesma entrada do carrinho
  // (mesma linha) — usar uma zera a outra automaticamente ao trocar.
  const isAmountSelected = cartEntry?.payload.type === "AMOUNT";

  function commitUnits(nextQuantity: number) {
    if (nextQuantity <= 0) {
      onRemove(line.key);
      return;
    }
    onChange({
      key: line.key,
      label: line.label,
      guestId: line.guestId,
      guestName: line.guestName,
      amountCents: nextQuantity * line.unitPriceCents,
      payload: { type: "UNITS", orderItemIds: line.orderItemIds, quantity: nextQuantity },
    });
  }

  return (
    <li>
      <Card padding="sm" className={`flex flex-col gap-2 ${isAmountSelected ? "ring-1 ring-inset ring-wine" : ""}`}>
        <div>
          <p className="text-sm font-medium text-ink">{line.label}</p>
          {line.guestName && <p className="text-xs text-muted">{line.guestName}</p>}
          <p className="tabular text-xs text-muted">
            {line.totalQuantity} lançado(s) · {line.openQuantity} em aberto ·{" "}
            {formatCentsBRL(line.unitPriceCents)}/un.
            {line.share &&
              ` · dividido em ${line.share.openParts} parte(s) de ${formatCentsBRL(line.share.nominalPartCents)}`}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Selecionar unidades</p>
          <div className="flex items-center gap-2">
            <IconButton
              label="Diminuir quantidade"
              icon={Minus}
              className="border border-line disabled:pointer-events-none disabled:opacity-40"
              onClick={() => {
                const next = Math.max(0, quantity - 1);
                setQuantity(next);
                commitUnits(next);
              }}
              disabled={quantity <= 0}
            />
            <span className="tabular w-8 text-center text-sm font-medium text-ink">{quantity}</span>
            <IconButton
              label="Aumentar quantidade"
              icon={Plus}
              className="border border-line disabled:pointer-events-none disabled:opacity-40"
              onClick={() => {
                const next = Math.min(line.openQuantity, quantity + 1);
                setQuantity(next);
                commitUnits(next);
              }}
              disabled={quantity >= line.openQuantity}
            />
            {line.openQuantity > 1 && (
              <button
                type="button"
                onClick={() => {
                  setQuantity(line.openQuantity);
                  commitUnits(line.openQuantity);
                }}
                className="text-xs font-medium text-wine underline underline-offset-2"
              >
                Selecionar todas
              </button>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Ou dividir o total</p>
          <AmountActions
            redirectPath={redirectPath}
            cartKey={line.key}
            label={line.label}
            guestId={line.guestId}
            guestName={line.guestName}
            orderItemIds={line.orderItemIds}
            openAmountCents={line.openAmountCents}
            share={line.share}
            defaultParts={defaultParts}
            showFull={false}
            cartEntry={isAmountSelected ? cartEntry : undefined}
            onChange={(entry) => {
              setQuantity(0);
              onChange(entry);
            }}
            onRemove={onRemove}
          />
        </div>
      </Card>
    </li>
  );
}

function SingleLineCard({
  line,
  redirectPath,
  defaultParts,
  cartEntry,
  onChange,
  onRemove,
}: {
  line: ClientSingleLine;
  redirectPath: string;
  defaultParts: number;
  cartEntry?: CartEntry;
  onChange: (entry: CartEntry) => void;
  onRemove: (key: string) => void;
}) {
  const isSelected = cartEntry !== undefined;

  return (
    <li>
      <Card padding="sm" className={`flex flex-col gap-2 ${isSelected ? "ring-1 ring-inset ring-wine" : ""}`}>
        <div>
          <p className="text-sm font-medium text-ink">{line.label}</p>
          {line.guestName && <p className="text-xs text-muted">{line.guestName}</p>}
          <p className="tabular text-xs text-muted">
            {formatCentsBRL(line.openAmountCents)} em aberto
            {line.share &&
              ` · dividido em ${line.share.openParts} parte(s) de ${formatCentsBRL(line.share.nominalPartCents)}`}
          </p>
        </div>
        <AmountActions
          redirectPath={redirectPath}
          cartKey={line.key}
          label={line.label}
          guestId={line.guestId}
          guestName={line.guestName}
          orderItemIds={[line.itemId]}
          openAmountCents={line.openAmountCents}
          share={line.share}
          defaultParts={defaultParts}
          showFull
          cartEntry={cartEntry}
          onChange={onChange}
          onRemove={onRemove}
        />
      </Card>
    </li>
  );
}

// Ações por valor (pagar inteiro / dividir / valor personalizado) —
// compartilhadas entre item único e linha de unidades (revisado
// 2026-08-16: dividir passou a valer pra qualquer item, não só o de
// quantidade 1; "orderItemIds" cobre uma ou mais linhas de origem reais).
function AmountActions({
  redirectPath,
  cartKey,
  label,
  guestId,
  guestName,
  orderItemIds,
  openAmountCents,
  share,
  defaultParts,
  showFull,
  cartEntry,
  onChange,
  onRemove,
}: {
  redirectPath: string;
  cartKey: string;
  label: string;
  guestId: string | null;
  guestName: string | null;
  orderItemIds: string[];
  openAmountCents: number;
  share: ClientShare | null;
  defaultParts: number;
  // Units já tem "Selecionar todas" fazendo esse papel — evita duplicar
  // o mesmo resultado com dois botões diferentes na mesma linha.
  showFull: boolean;
  cartEntry?: CartEntry;
  onChange: (entry: CartEntry) => void;
  onRemove: (key: string) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [shareFormOpen, setShareFormOpen] = useState(false);
  const isSelected = cartEntry !== undefined;
  // Cada botão sinaliza só a própria opção selecionada, não qualquer
  // seleção da linha (correção 2026-08-18, relato do usuário: "Pagar
  // inteiro" aparecia destacado em vermelho mesmo sem nada selecionado,
  // e "1 parte" nunca destacava depois de escolhido — variante estava
  // invertida e as outras não refletiam o carrinho).
  const selectedPayload = cartEntry?.payload.type === "AMOUNT" ? cartEntry.payload : undefined;
  const isFullSelected = selectedPayload?.mode === "FULL";
  const isShareSelected = selectedPayload?.mode === "SHARE";
  const isCustomSelected = selectedPayload?.mode === "CUSTOM";

  function selectFull() {
    onChange({
      key: cartKey,
      label,
      guestId,
      guestName,
      amountCents: openAmountCents,
      payload: { type: "AMOUNT", orderItemIds, mode: "FULL" },
    });
  }

  function selectShare(parts: number) {
    if (!share) return;
    onChange({
      key: cartKey,
      label,
      guestId,
      guestName,
      amountCents: share.nominalPartCents * parts,
      payload: { type: "AMOUNT", orderItemIds, mode: "SHARE", parts },
    });
  }

  function selectCustom() {
    const amount = Number(customValue.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const cents = Math.round(amount * 100);
    if (cents > openAmountCents) return;
    onChange({
      key: cartKey,
      label,
      guestId,
      guestName,
      amountCents: cents,
      payload: { type: "AMOUNT", orderItemIds, mode: "CUSTOM", amount },
    });
    setCustomOpen(false);
    setCustomValue("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {showFull && (
          <Button variant={isFullSelected ? "secondary" : "outline"} size="sm" onClick={selectFull}>
            Pagar inteiro
          </Button>
        )}
        {share && (
          <Button variant={isShareSelected ? "secondary" : "outline"} size="sm" onClick={() => selectShare(1)}>
            1 parte ({formatCentsBRL(share.nominalPartCents)})
          </Button>
        )}
        <Button
          variant={isCustomSelected ? "secondary" : "outline"}
          size="sm"
          onClick={() => setCustomOpen((v) => !v)}
        >
          Outro valor
        </Button>
        <button
          type="button"
          onClick={() => setShareFormOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink underline underline-offset-2"
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" />
          {share ? "Redistribuir" : "Dividir"}
        </button>
        {isSelected && (
          <button
            type="button"
            onClick={() => onRemove(cartKey)}
            className="text-xs font-medium text-wine underline underline-offset-2"
          >
            Remover seleção
          </button>
        )}
      </div>

      {customOpen && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
              R$
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder="0,00"
              aria-label={`Valor personalizado para ${label}`}
              className="h-10 w-full rounded-control-sm border border-line bg-surface pl-10 pr-3 text-sm text-ink tabular focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={selectCustom}>
            Adicionar
          </Button>
        </div>
      )}

      {shareFormOpen && (
        <ShareItemForm
          redirectPath={redirectPath}
          orderItemIds={orderItemIds}
          currentParts={share?.openParts ?? defaultParts}
          onDone={() => setShareFormOpen(false)}
        />
      )}
    </div>
  );
}

// "Dividir" / "Redistribuir" (ADR 0006, revisado 2026-08-16: opera sobre
// o grupo inteiro — uma ou mais linhas de origem) — mutação de verdade,
// imediata, independente do carrinho de pagamento: fica gravada mesmo se
// o operador não confirmar nenhum pagamento agora (regra confirmada com o
// usuário 2026-08-15).
function ShareItemForm({
  redirectPath,
  orderItemIds,
  currentParts,
  onDone,
}: {
  redirectPath: string;
  orderItemIds: string[];
  currentParts: number;
  onDone: () => void;
}) {
  const action = setItemShareAction.bind(null, redirectPath, orderItemIds);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [parts, setParts] = useState(Math.max(2, currentParts));

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) onDone();
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-control-sm border border-dashed border-line p-2">
      <input type="hidden" name="parts" value={parts} />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Dividir o saldo aberto em</span>
        <IconButton
          label="Diminuir partes"
          icon={Minus}
          size="sm"
          className="border border-line"
          onClick={() => setParts((p) => Math.max(2, p - 1))}
        />
        <span className="tabular w-6 text-center text-sm font-medium text-ink">{parts}</span>
        <IconButton
          label="Aumentar partes"
          icon={Plus}
          size="sm"
          className="border border-line"
          onClick={() => setParts((p) => Math.min(20, p + 1))}
        />
        <span className="text-xs text-muted">parte(s)</span>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Salvando..." className="h-9 self-start px-3 text-sm">
        Confirmar divisão
      </SubmitButton>
    </form>
  );
}
