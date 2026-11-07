"use client";

import { useId, useState } from "react";
import { TextField } from "@/components/form/field";
import { MaskedMoneyInput } from "@/components/form/masked-money-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

function formatCentsBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Preço promocional por kg no lançamento (pedido do usuário, 2026-11-08:
// "às vezes tenho uma carne que é R$99,90 o quilo, só que naquele dia tem
// uma promoção... eu gostaria de aplicar esse desconto no lançamento, sem
// ter que calcular na mão") — aberto pelo ícone de editar na linha de
// peso do carrinho (CartPanel), cobre item escaneado da balança ou
// digitado na mão, sempre o mesmo lugar pra ajustar. Nunca deixa passar
// do preço de tabela (é desconto, não editor de preço livre) — mesma
// mecânica de dígito-entra-pela-direita do campo de dinheiro (pedido do
// usuário, 2026-11-08, mesmo dia do pedido deste diálogo).
export function WeightPriceOverrideDialog({
  productName,
  catalogPriceCents,
  initialPriceCents,
  onConfirm,
  onClose,
}: {
  productName: string;
  catalogPriceCents: number;
  initialPriceCents: number;
  onConfirm: (priceCents: number, reason: string) => void;
  onClose: () => void;
}) {
  const priceId = useId();
  const [priceCents, setPriceCents] = useState(initialPriceCents);
  const [reason, setReason] = useState("");

  const overLimit = priceCents > catalogPriceCents;
  const valid = priceCents > 0 && !overLimit;

  function confirm() {
    if (!valid) return;
    onConfirm(priceCents, reason);
  }

  return (
    <ConfirmDialog
      open
      title={`Preço promocional de ${productName}`}
      description={`Preço de tabela: ${formatCentsBRL(catalogPriceCents)}/kg. Informe o preço por quilo que vale para esta pesagem.`}
      onCancel={onClose}
      confirmSlot={
        <Button onClick={confirm} disabled={!valid}>
          Aplicar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={priceId} className="text-sm font-medium text-ink">
            Preço por quilo (R$)
          </label>
          <MaskedMoneyInput
            id={priceId}
            valueCents={priceCents}
            onChangeCents={setPriceCents}
            ariaLabel="Preço por quilo"
            autoFocus
          />
          {overLimit && (
            <p role="alert" className="text-xs text-wine">
              O preço promocional não pode ser maior que o preço de tabela.
            </p>
          )}
        </div>
        <TextField
          label="Motivo (opcional)"
          name="weightPriceOverrideReason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          hint="Vai pra auditoria, igual ao desconto da venda."
        />
      </div>
    </ConfirmDialog>
  );
}
