"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { registerPaymentAction, type FormState } from "./actions";

type PaymentMethodOption = { id: string; name: string };

const initialState: FormState = { error: null };

// Cada pagamento tem sua própria idempotencyKey (regra 18/19) — gerada no
// cliente e trocada a cada envio bem-sucedido, porque o caixa pode registrar
// mais de um pagamento seguido pra fechar a mesma comanda (regra 13, mais de
// uma forma de pagamento).
export function RegisterPaymentForm({
  tableId,
  sessionId,
  paymentMethods,
  balance,
}: {
  tableId: string;
  sessionId: string;
  paymentMethods: PaymentMethodOption[];
  // Saldo restante no momento em que a página carregou — só serve de
  // sugestão inicial no campo de valor (o servidor sempre revalida o valor
  // de verdade; CLAUDE.md regra 24).
  balance: string;
}) {
  const { showToast } = useToast();
  const action = registerPaymentAction.bind(null, tableId, sessionId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [amount, setAmount] = useState(balance);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Pagamento registrado.");
      setAmount("");
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
      <TextField
        label="Valor (R$)"
        name="amount"
        inputMode="decimal"
        required
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
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
