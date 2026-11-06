"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { centsToDigits, digitsToCents, formatDigits } from "@/lib/money-mask";
import { inputBaseClass } from "@/components/ui/input";

// Decimal(10,2) no banco — mesmo teto de MoneyField (money-field.tsx).
const MAX_DIGITS = 10;

// Variante CONTROLADA de MoneyField, em centavos — usada onde o valor
// precisa ser lido ao vivo em JS pra calcular outra coisa na hora (troco,
// "quanto falta" do PDV), não só escrito num <input type="hidden"> pra o
// servidor ler no submit. Mesma mecânica de digitação de MoneyField
// (dígito sempre entra pela direita, cursor preso no fim) — ver
// src/lib/money-mask.ts pro algoritmo compartilhado entre os dois.
export function MaskedMoneyInput({
  valueCents,
  onChangeCents,
  id,
  ariaLabel,
  placeholder,
  className = "",
  autoFocus,
}: {
  valueCents: number;
  onChangeCents: (cents: number) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState(() => centsToDigits(valueCents));

  // Sincroniza quando o valor muda por fora (ex.: prefill automático ao
  // trocar forma de pagamento, ou limpar ao cancelar a venda) — só
  // quando realmente diverge, pra não brigar com o que a pessoa está
  // digitando no meio do caminho.
  useEffect(() => {
    if (digitsToCents(digits) !== valueCents) setDigits(centsToDigits(valueCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);

  const { display } = formatDigits(digits);

  // Mesmo racional de MoneyField: dígito sempre entra pela direita —
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
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
        R$
      </span>
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
          onChangeCents(digitsToCents(onlyDigits));
        }}
        onFocus={moveCaretToEnd}
        onMouseUp={moveCaretToEnd}
        className={`${inputBaseClass} w-full pl-10 text-right tabular ${className}`}
      />
    </div>
  );
}
