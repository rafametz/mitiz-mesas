"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { inputBaseClass } from "@/components/ui/input";

// Campo de valor em Real — pedido do usuário: digitar preenche da direita
// pra esquerda, tipo calculadora/PDV ("12" -> "0,12", mais um dígito -> "1,23"),
// sempre com vírgula e duas casas decimais, sem deixar digitar separador
// nem letra por engano. Padrão de sistema — CLAUDE.md regra 20/21 (nunca
// ponto flutuante pra dinheiro) continua garantida pelo servidor: este
// componente só formata o que aparece na tela, o valor de verdade enviado
// no <input type="hidden"> é sempre uma string decimal com ponto
// ("12.34"), no mesmo formato que os schemas zod já validavam antes.
//
// Decimal(10,2) no banco — 8 dígitos inteiros + 2 decimais, daí o teto de
// dígitos abaixo (não é regra de negócio, só evita um número absurdo de
// dígitos digitados por engano).
const MAX_DIGITS = 10;

function digitsFromValue(value?: string): string {
  if (!value) return "";
  const cleaned = value.trim().replace("-", "").replace(",", ".");
  if (!cleaned || cleaned === "0") return "";
  const [intPart = "0", decPart = ""] = cleaned.split(".");
  const cents = `${intPart}${decPart.padEnd(2, "0").slice(0, 2)}`;
  return cents.replace(/^0+(?=\d)/, "");
}

// A partir dos dígitos "correndo" (sem separador, sem sinal), monta tanto o
// texto exibido (formato brasileiro, com milhar) quanto o valor cru que vai
// no campo escondido (formato universal, com ponto — o que os schemas zod
// dos formulários existentes já esperam).
function formatDigits(digits: string): { display: string; raw: string } {
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const reaisDigits = padded.slice(0, -2);
  const reaisNumber = Number(reaisDigits || "0");
  return {
    display: `${reaisNumber.toLocaleString("pt-BR")},${cents}`,
    raw: `${reaisNumber}.${cents}`,
  };
}

export function MoneyField({
  label,
  name,
  defaultValue,
  allowNegative = false,
  hint,
  className,
}: {
  label: string;
  name: string;
  // String decimal com ponto (ex.: "12.34", "-5.00") ou vazio/undefined —
  // mesmo formato que o campo já recebia antes deste componente existir.
  defaultValue?: string;
  // Modificadores podem ter valor negativo (ex.: retirar um ingrediente) —
  // produto, pagamento e desconto nunca são negativos, então o botão de
  // sinal só aparece quando pedido explicitamente.
  allowNegative?: boolean;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [digits, setDigits] = useState(() => digitsFromValue(defaultValue));
  const [negative, setNegative] = useState(
    () => allowNegative && (defaultValue ?? "").trim().startsWith("-"),
  );

  const { display, raw } = formatDigits(digits.slice(0, MAX_DIGITS));
  const isZero = digits === "";
  const signedRaw = negative && !isZero ? `-${raw}` : raw;

  // Dígito sempre entra pela direita — trava o cursor no fim do campo a
  // cada mudança, então não importa onde a pessoa tocou/clicou, o próximo
  // dígito sempre "empurra" os que já estavam lá (pedido explícito do
  // usuário: "a numeração vai correndo").
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  }, [digits]);

  // Pedido do usuário: ao TOCAR/CLICAR no campo (não só ao digitar), o
  // cursor já deve pular pro fim (casa decimal). O navegador só define a
  // posição do cursor de acordo com onde o toque caiu depois que o evento
  // de foco/clique termina de processar — por isso o ajuste precisa ficar
  // num próximo frame, senão o navegador sobrescreve de volta pra posição
  // tocada.
  const moveCaretToEnd = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }, []);

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="flex items-stretch gap-1.5">
        {allowNegative && (
          <button
            type="button"
            onClick={() => setNegative((n) => !n)}
            aria-pressed={negative}
            aria-label={
              negative ? "Valor negativo, trocar para positivo" : "Valor positivo, trocar para negativo"
            }
            title={negative ? "Valor negativo" : "Valor positivo"}
            className={`h-11 w-11 shrink-0 rounded-control-sm border text-base font-semibold transition-colors ${
              negative ? "border-wine bg-wine/10 text-wine" : "border-line text-ink hover:bg-ink/5"
            }`}
          >
            {negative ? "−" : "+"}
          </button>
        )}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
            R$
          </span>
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={display}
            onChange={(event) => {
              const onlyDigits = event.target.value.replace(/\D/g, "");
              setDigits(onlyDigits.slice(0, MAX_DIGITS));
            }}
            onFocus={moveCaretToEnd}
            onMouseUp={moveCaretToEnd}
            className={`${inputBaseClass} w-full pl-10 text-right tabular`}
          />
        </div>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <input type="hidden" name={name} value={signedRaw} />
    </div>
  );
}
