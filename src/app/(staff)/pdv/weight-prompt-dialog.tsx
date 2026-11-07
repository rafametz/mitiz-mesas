"use client";

import { useState } from "react";
import { TextField } from "@/components/form/field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// Peso digitado na mão pra produto vendido por quilo, quando não tem
// leitura de balança disponível (configuração desligada em
// /admin/configuracoes, ou o operador só quer tocar o card direto) —
// pedido do usuário 2026-11-07: tocar o card de um produto "KG" abre este
// campo em vez de adicionar direto com quantidade 1, que não faria
// sentido pra um produto cujo preço é por quilo.
export function WeightPromptDialog({
  productName,
  onConfirm,
  onClose,
}: {
  productName: string;
  onConfirm: (weightKg: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  const parsed = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed > 0;

  function confirm() {
    if (!valid) return;
    onConfirm(Math.round(parsed * 1000) / 1000);
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
      <TextField
        label="Peso (kg)"
        name="weightKg"
        type="number"
        inputMode="decimal"
        step="0.001"
        min="0.001"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            confirm();
          }
        }}
      />
    </ConfirmDialog>
  );
}
