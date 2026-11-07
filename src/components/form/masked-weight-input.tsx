"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { digitsToUnits, formatDigits, unitsToDigits } from "@/lib/money-mask";
import { inputBaseClass } from "@/components/ui/input";

// 999,999 kg — mesmo teto de peso aceito pelo servidor
// (orderItemSchema.weightQuantity, create-order.ts), 6 dígitos.
const MAX_DIGITS = 6;
const DECIMAL_PLACES = 3;

// Peso em kg, mesma mecânica de dígito de MaskedMoneyInput (dígito sempre
// entra pela direita, cursor preso no fim) — pedido do usuário 2026-11-08:
// "mesmo formato do real, só que o real é 2 casas decimais, o do peso vai
// ser 3". `valueGrams`/`onChangeGrams`: controlado na menor unidade (1
// grama = 0,001 kg), mesmo racional de MaskedMoneyInput usar centavos —
// `src/lib/money-mask.ts` tem o algoritmo compartilhado, parametrizado
// por `decimalPlaces`.
export function MaskedWeightInput({
  valueGrams,
  onChangeGrams,
  id,
  ariaLabel,
  placeholder,
  className = "",
  autoFocus,
  onKeyDown,
}: {
  valueGrams: number;
  onChangeGrams: (grams: number) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState(() => unitsToDigits(valueGrams));

  useEffect(() => {
    if (digitsToUnits(digits) !== valueGrams) setDigits(unitsToDigits(valueGrams));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueGrams]);

  const { display } = formatDigits(digits, DECIMAL_PLACES);

  // Mesmo racional de MaskedMoneyInput: dígito sempre entra pela direita —
  // trava o cursor no fim a cada mudança e também ao tocar/clicar no
  // campo (o navegador só aplica a posição clicada depois que o evento
  // de foco termina, daí o `requestAnimationFrame`).
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [digits]);

  const moveCaretToEnd = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={display}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => {
          const onlyDigits = event.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
          setDigits(onlyDigits);
          onChangeGrams(digitsToUnits(onlyDigits));
        }}
        onFocus={moveCaretToEnd}
        onMouseUp={moveCaretToEnd}
        onKeyDown={onKeyDown}
        className={`${inputBaseClass} w-full pr-10 text-right tabular ${className}`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
        kg
      </span>
    </div>
  );
}
