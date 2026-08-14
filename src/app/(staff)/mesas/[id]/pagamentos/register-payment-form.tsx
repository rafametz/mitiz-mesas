"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SelectField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { registerPaymentAction, type FormState } from "./actions";

type PaymentMethodOption = { id: string; name: string };
type GuestOption = { id: string; name: string };

const initialState: FormState = { error: null };

// Formatador local (não `formatBRL` de @/lib/money) de propósito — esse
// util usa Prisma.Decimal, que arrasta o runtime do decimal.js pro bundle
// do cliente à toa (mesmo racional já aplicado em
// pedidos/novo/new-order-form.tsx). Aqui é só exibição de um valor que o
// servidor já validou, não precisa da precisão de Decimal no navegador.
function formatBRLNumber(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cada pagamento tem sua própria idempotencyKey (regra 18/19) — gerada no
// cliente e trocada a cada envio bem-sucedido, porque o caixa pode registrar
// mais de um pagamento seguido pra fechar a mesma comanda (regra 13, mais de
// uma forma de pagamento).
export function RegisterPaymentForm({
  redirectPath,
  sessionId,
  paymentMethods,
  guests,
  balance,
}: {
  redirectPath: string;
  sessionId: string;
  paymentMethods: PaymentMethodOption[];
  // Pessoas ativas da mesa — pagamento por pessoa (revisão 2026-08-10),
  // opcional: em branco = pagamento geral da mesa, como sempre foi.
  guests: GuestOption[];
  // Saldo restante no momento em que a página carregou — só exibido como
  // referência abaixo do campo (pedido do usuário: o valor não vem mais
  // pré-preenchido, o campo começa vazio pro caixa digitar o valor real
  // recebido, que pode ser parcial). O servidor sempre revalida o saldo de
  // verdade antes de aceitar (CLAUDE.md regra 24).
  balance: string;
}) {
  const { showToast } = useToast();
  const action = registerPaymentAction.bind(null, redirectPath, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Pagamento registrado.");
      setIdempotencyKey(crypto.randomUUID());
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <SelectField label="Forma de pagamento" name="paymentMethodId" required defaultValue="">
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
        <SelectField label="Pessoa (opcional, em branco = pagamento geral)" name="guestId" defaultValue="">
          <option value="">Pagamento geral da mesa</option>
          {guests.map((guest) => (
            <option key={guest.id} value={guest.id}>
              {guest.name}
            </option>
          ))}
        </SelectField>
      )}
      {/* Campo sempre começa vazio — o caixa digita o valor recebido de
          verdade (pedido do usuário: não presumir que o pagamento é
          sempre do saldo inteiro). `key` só força remontar (limpar) a
          cada pagamento bem-sucedido. */}
      <MoneyField
        key={idempotencyKey}
        label="Valor"
        name="amount"
        hint={`Saldo em aberto: ${formatBRLNumber(Number(balance))}`}
      />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Registrando...">Registrar pagamento</SubmitButton>
    </form>
  );
}
