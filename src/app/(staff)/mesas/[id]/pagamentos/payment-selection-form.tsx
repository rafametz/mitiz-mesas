"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { registerItemPaymentAction, type FormState } from "./actions";
import { formatCentsBRL, ItemSelectionCards, type CartEntry } from "./item-selection-list";
import type { ClientPayableLine } from "./payment-selection-lines";

type PaymentMethodOption = { id: string; name: string };
type GuestOption = { id: string; name: string };

const initialState: FormState = { error: null };

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006). O
// "carrinho" aqui é puramente local (React state) até o envio final —
// nada é gravado enquanto o operador está montando a seleção (regra
// confirmada com o usuário: "seleção não significa pagamento"). Só ao
// confirmar em "Registrar pagamento" é que vira Payment +
// PaymentItemAllocation, numa transação só, e o servidor revalida tudo de
// novo contra o banco (regra 24) — o que está aqui é só uma proposta.
//
// Os cartões de seleção (UnitsLineCard/SingleLineCard/AmountActions) foram
// extraídos para item-selection-list.tsx (ADR 0010 — Pagamento Combinado,
// 2026-10-20), reaproveitados tal e qual pelo PDV ("+ Adicionar consumo de
// mesa"). Este componente continua dono do carrinho e da etapa final de
// Recebimento (forma de pagamento + pessoa), que o PDV não usa — lá quem
// decide a forma de pagamento é a tela combinada de recebimento.
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

  // Se todo mundo no carrinho é da mesma pessoa, sugere ela como
  // responsável do pagamento — o operador continua livre para trocar ou
  // deixar em branco (associação nunca é obrigatória).
  useEffect(() => {
    const guestIds = new Set(
      cart.map((entry) => entry.guestId).filter((id): id is string => id !== null),
    );
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
      <div className="flex flex-col gap-4">
        {lines.length > 0 && (
          <h2 className="text-base font-semibold text-ink">Itens em aberto</h2>
        )}
        <ItemSelectionCards
          redirectPath={redirectPath}
          lines={lines}
          guestCount={guestCount}
          cart={cart}
          onChange={upsertEntry}
          onRemove={removeEntry}
          emptyMessage="Nenhum item em aberto para selecionar. Use o pagamento sem detalhar itens."
        />
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-ink">
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
                  <span className="tabular font-medium text-ink">
                    {formatCentsBRL(entry.amountCents)}
                  </span>
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
          <h2 className="text-base font-semibold text-ink">Recebimento</h2>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input
              type="hidden"
              name="allocationsJson"
              value={JSON.stringify(allocationsPayload)}
            />
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
            <p className="text-xs text-muted">
              Saldo em aberto da conta:{" "}
              {balance ? formatCentsBRL(Math.round(Number(balance) * 100)) : "R$ 0,00"}
            </p>
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
