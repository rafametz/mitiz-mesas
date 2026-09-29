"use client";

import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

// Quantidade sempre em número inteiro (pedido do usuário 2026-10-04: a
// MITIZ reserva assado por unidade, nunca fração) — mesmo padrão de
// stepper +/- já usado em mesas/[id]/pedidos/novo/new-order-form.tsx
// (campo controlado por string, não por number, pra não travar o "1"
// pré-marcado ao tentar apagar; normaliza pra inteiro só ao sair do
// campo, nunca durante a digitação).
const MIN_QUANTITY = 0;
const MAX_QUANTITY = 999;

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return MIN_QUANTITY;
  return Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, Math.trunc(value)));
}

export function QuantityStepper({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const quantity = clampQuantity(Number(value || 0));

  function setClamped(next: number) {
    onChange(String(clampQuantity(next)));
  }

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        label={`Diminuir ${ariaLabel}`}
        icon={Minus}
        className="border border-line disabled:pointer-events-none disabled:opacity-40"
        onClick={() => setClamped(quantity - 1)}
        disabled={disabled || quantity <= MIN_QUANTITY}
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          // Só dígitos, campo pode ficar vazio enquanto digita — mesmo
          // racional do campo de quantidade do pedido de mesa.
          if (raw === "" || /^\d+$/.test(raw)) onChange(raw);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => onChange(value === "" ? "" : String(quantity))}
        placeholder="0"
        className="h-11 w-16 rounded-control-sm border border-line bg-surface text-center tabular text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20 disabled:opacity-50"
      />
      <IconButton
        label={`Aumentar ${ariaLabel}`}
        icon={Plus}
        className="border border-line disabled:pointer-events-none disabled:opacity-40"
        onClick={() => setClamped(quantity + 1)}
        disabled={disabled || quantity >= MAX_QUANTITY}
      />
    </div>
  );
}
