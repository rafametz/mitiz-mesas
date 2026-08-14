"use client";

import { useActionState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { createPickupAction, type FormState } from "../actions";

const initialState: FormState = { error: null };

const ORIGIN_OPTIONS = [
  { value: "COUNTER", label: "Balcão" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "PHONE", label: "Telefone" },
];

// Só pede o que a operação realmente precisa (pedido do usuário) — nome é
// a única informação obrigatória; telefone, origem, horário previsto e
// observação ficam opcionais. Depois de criada, cai direto na tela da
// retirada (mesmo carrinho de produtos já usado nas mesas).
export function NewPickupForm({
  waiters,
  currentUserId,
}: {
  waiters: { id: string; name: string }[];
  currentUserId: string;
}) {
  const [state, formAction] = useActionState(createPickupAction, initialState);
  const isCurrentUserWaiter = waiters.some((w) => w.id === currentUserId);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4 pb-4">
      <TextField label="Nome do cliente" name="customerName" required maxLength={120} autoFocus />
      <TextField
        label="Telefone (opcional)"
        name="customerPhone"
        type="tel"
        maxLength={30}
        placeholder="(11) 99999-9999"
      />
      <SelectField label="Origem do pedido (opcional)" name="pickupOrigin" defaultValue="">
        <option value="">Não informado</option>
        {ORIGIN_OPTIONS.map((origin) => (
          <option key={origin.value} value={origin.value}>
            {origin.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Horário previsto para retirada (opcional)"
        name="requestedTime"
        type="time"
      />
      <SelectField
        label="Garçom responsável"
        name="waiterId"
        required
        defaultValue={isCurrentUserWaiter ? currentUserId : ""}
      >
        {!isCurrentUserWaiter && (
          <option value="" disabled>
            Selecione
          </option>
        )}
        {waiters.map((waiter) => (
          <option key={waiter.id} value={waiter.id}>
            {waiter.name}
          </option>
        ))}
      </SelectField>
      <TextAreaField label="Observação (opcional)" name="pickupNote" maxLength={500} />

      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}

      <SubmitButton>Criar retirada</SubmitButton>
    </form>
  );
}
