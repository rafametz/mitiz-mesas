import type { InputHTMLAttributes } from "react";

// Fonte única da classe visual de campo de texto — reutilizada por
// src/components/form/field.tsx (TextField/SelectField/TextAreaField, que
// acrescentam label) e por Input (abaixo), para os casos em que um label
// visível de verdade não cabe (ex.: um campo dentro de uma lista, um nome
// entre vários do mesmo tipo). Existia duplicada em field.tsx antes da
// Fase 1 do plano de modernização.
export const inputBaseClass =
  "h-11 rounded-control-sm border border-line bg-surface px-3 text-base text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-gold disabled:opacity-60";

// Input cru, sem label associado — só usar quando um `<label>` visível de
// verdade (via TextField) não couber no layout. Mesmo assim, `aria-label`
// (ou um label com classe `sr-only`) continua obrigatório para
// acessibilidade; este componente não dispensa isso, só não desenha um
// label visível sozinho.
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBaseClass} ${className}`} {...props} />;
}
