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

// Cada pagamento tem sua própria idempotencyKey (regra 18/19) — gerada no
// cliente e trocada a cada envio bem-sucedido, porque o caixa pode registrar
// mais de um pagamento seguido pra fechar a mesma comanda (regra 13, mais de
// uma forma de pagamento).
export function RegisterPaymentForm({
  tableId,
  sessionId,
  paymentMethods,
  guests,
  balance,
}: {
  tableId: string;
  sessionId: string;
  paymentMethods: PaymentMethodOption[];
  // Pessoas ativas da mesa — pagamento por pessoa (revisão 2026-08-10),
  // opcional: em branco = pagamento geral da mesa, como sempre foi.
  guests: GuestOption[];
  // Saldo restante no momento em que a página carregou — só serve de
  // sugestão inicial no campo de valor (o servidor sempre revalida o valor
  // de verdade; CLAUDE.md regra 24).
  balance: string;
}) {
  const { showToast } = useToast();
  const action = registerPaymentAction.bind(null, tableId, sessionId);
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
        <SelectField label="Pessoa (opcional — em branco = pagamento geral)" name="guestId" defaultValue="">
          <option value="">Pagamento geral da mesa</option>
          {guests.map((guest) => (
            <option key={guest.id} value={guest.id}>
              {guest.name}
            </option>
          ))}
        </SelectField>
      )}
      {/* `key` força remontar o campo (e reler `balance`) a cada pagamento
          bem-sucedido — depois de revalidatePath, o saldo já vem atualizado
          do servidor, então o próximo pagamento já sugere o valor certo em
          vez de ficar com o valor antigo ou em branco. */}
      <MoneyField key={idempotencyKey} label="Valor" name="amount" defaultValue={balance} />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Registrando...">Registrar pagamento</SubmitButton>
    </form>
  );
}
