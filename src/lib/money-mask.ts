// Máscara de valor com casas decimais fixas, compartilhada — extraída de
// src/components/form/money-field.tsx (2026-11-06) pra também ser usada
// por masked-money-input.tsx (variante controlada em centavos, valor lido
// ao vivo em JS — ex.: troco do PDV) e, com `decimalPlaces: 3`, por
// masked-weight-input.tsx (peso em kg, venda por quilo do PDV,
// 2026-11-07 — "mesmo formato do real, só que o real é 2 casas decimais,
// o do peso vai ser 3"). Mesmo algoritmo em todos: dígito sempre entra
// pela direita, igual calculadora/PDV físico — só a quantidade de casas
// decimais muda.
const DEFAULT_DECIMAL_PLACES = 2;

/** String decimal ("12.34", "-5") -> dígitos crus na menor unidade ("1234"). */
export function digitsFromValue(value?: string, decimalPlaces = DEFAULT_DECIMAL_PLACES): string {
  if (!value) return "";
  const cleaned = value.trim().replace("-", "").replace(",", ".");
  if (!cleaned || cleaned === "0") return "";
  const [intPart = "0", decPart = ""] = cleaned.split(".");
  const rawDigits = `${intPart}${decPart.padEnd(decimalPlaces, "0").slice(0, decimalPlaces)}`;
  return rawDigits.replace(/^0+(?=\d)/, "");
}

/** Dígitos crus na menor unidade -> texto exibido (pt-BR) e valor cru (ponto). */
export function formatDigits(
  digits: string,
  decimalPlaces = DEFAULT_DECIMAL_PLACES,
): { display: string; raw: string } {
  const padded = digits.padStart(decimalPlaces + 1, "0");
  const decDigits = padded.slice(-decimalPlaces);
  const intDigits = padded.slice(0, -decimalPlaces);
  const intNumber = Number(intDigits || "0");
  return {
    display: `${intNumber.toLocaleString("pt-BR")},${decDigits}`,
    raw: `${intNumber}.${decDigits}`,
  };
}

/** Dígitos crus na menor unidade -> inteiro, pra cálculo em JS. */
export function digitsToUnits(digits: string): number {
  return digits === "" ? 0 : Number(digits);
}

/** Inteiro na menor unidade -> dígitos crus (sem zero à esquerda). */
export function unitsToDigits(units: number): string {
  if (!Number.isFinite(units) || units <= 0) return "";
  return String(Math.round(units));
}
