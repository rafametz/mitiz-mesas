// Máscara de dinheiro compartilhada — extraída de
// src/components/form/money-field.tsx (2026-11-06) pra também ser usada
// por src/components/form/masked-money-input.tsx (variante controlada,
// em centavos, usada onde o valor precisa ser lido ao vivo em JS — ex.:
// recebimento do PDV calculando troco). Mesmo algoritmo nos dois: dígito
// sempre entra pela direita, igual calculadora/PDV físico.

/** String decimal ("12.34", "-5") -> dígitos crus em centavos ("1234"). */
export function digitsFromValue(value?: string): string {
  if (!value) return "";
  const cleaned = value.trim().replace("-", "").replace(",", ".");
  if (!cleaned || cleaned === "0") return "";
  const [intPart = "0", decPart = ""] = cleaned.split(".");
  const cents = `${intPart}${decPart.padEnd(2, "0").slice(0, 2)}`;
  return cents.replace(/^0+(?=\d)/, "");
}

/** Dígitos crus em centavos -> texto exibido (pt-BR) e valor cru (ponto). */
export function formatDigits(digits: string): { display: string; raw: string } {
  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const reaisDigits = padded.slice(0, -2);
  const reaisNumber = Number(reaisDigits || "0");
  return {
    display: `${reaisNumber.toLocaleString("pt-BR")},${cents}`,
    raw: `${reaisNumber}.${cents}`,
  };
}

/** Dígitos crus em centavos -> inteiro de centavos, pra cálculo em JS. */
export function digitsToCents(digits: string): number {
  return digits === "" ? 0 : Number(digits);
}

/** Inteiro de centavos -> dígitos crus (sem zero à esquerda). */
export function centsToDigits(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return String(Math.round(cents));
}
