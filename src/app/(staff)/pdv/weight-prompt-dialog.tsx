"use client";

import { useId, useState } from "react";
import { MaskedWeightInput } from "@/components/form/masked-weight-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Peso digitado na mão pra produto vendido por quilo, quando não tem
// leitura de balança disponível (configuração desligada em
// /admin/configuracoes, ou o operador só quer tocar o card direto) —
// pedido do usuário 2026-11-07: tocar o card de um produto "KG" abre este
// campo em vez de adicionar direto com quantidade 1, que não faria
// sentido pra um produto cujo preço é por quilo.
//
// Mesma máscara de dígito do campo de dinheiro (pedido do usuário
// 2026-11-08: "mesmo formato do real, só que o real é 2 casas decimais, o
// do peso vai ser 3") — dígito sempre entra pela direita, cursor preso no
// fim, controlado em gramas (MaskedWeightInput, grams = 0,001 kg).
export function WeightPromptDialog({
  productName,
  onConfirm,
  onClose,
}: {
  productName: string;
  onConfirm: (weightKg: number) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [grams, setGrams] = useState(0);
  const valid = grams > 0;

  function confirm() {
    if (!valid) return;
    onConfirm(grams / 1000);
  }

  return (
    <ConfirmDialog
      open
      title={`Peso de ${productName}`}
      description="Informe o peso em quilos para adicionar à venda."
      onCancel={onClose}
      confirmSlot={
        <Button onClick={confirm} disabled={!valid}>
          Adicionar
        </Button>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          Peso (kg)
        </label>
        <MaskedWeightInput
          id={inputId}
          valueGrams={grams}
          onChangeGrams={setGrams}
          ariaLabel="Peso (kg)"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </div>
    </ConfirmDialog>
  );
}
