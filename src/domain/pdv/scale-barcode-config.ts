// Validação pura da configuração de leitura de código de barras gerado por
// balança (PDV por quilo, pedido do usuário 2026-11-07) — sem I/O, testável
// sem banco (CLAUDE.md seção 24: frontend nunca é a única camada de
// validação; isto é o que roda no backend antes de gravar). Usado tanto
// pela server action (src/app/admin/configuracoes/actions.ts) quanto pela
// camada de aplicação (src/application/pdv/scale-barcode-config.ts).

export type ScaleBarcodeValueType = "WEIGHT" | "PRICE";

export type ScaleBarcodeConfigInput = {
  enabled: boolean;
  prefixDigit: number;
  totalLength: number;
  productCodeStart: number;
  productCodeEnd: number;
  valueStart: number;
  valueEnd: number;
  valueType: ScaleBarcodeValueType;
  decimalPlaces: number;
};

export class ScaleBarcodeConfigValidationError extends Error {}

// Limites largos o bastante para cobrir EAN-8/13/14 e formatos
// proprietários de balança, sem deixar passar um número digitado errado
// (ex.: tamanho negativo ou gigantesco).
const MIN_TOTAL_LENGTH = 6;
const MAX_TOTAL_LENGTH = 30;

function checkDigitRange(label: string, start: number, end: number, totalLength: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new ScaleBarcodeConfigValidationError(
      `Os dígitos do campo de ${label} devem ser números inteiros.`,
    );
  }
  // Dígito 1 é sempre o número inicial (prefixDigit) — os campos de
  // conteúdo nunca começam antes do dígito 2.
  if (start < 2) {
    throw new ScaleBarcodeConfigValidationError(
      `O campo de ${label} deve iniciar a partir do dígito 2. O dígito 1 é o número inicial que identifica o código.`,
    );
  }
  if (end < start) {
    throw new ScaleBarcodeConfigValidationError(
      `O campo de ${label} tem o dígito final menor que o inicial.`,
    );
  }
  if (end > totalLength) {
    throw new ScaleBarcodeConfigValidationError(
      `O campo de ${label} não pode ir além do tamanho total do código (${totalLength} dígitos).`,
    );
  }
}

export function validateScaleBarcodeConfig(data: ScaleBarcodeConfigInput): void {
  if (!Number.isInteger(data.prefixDigit) || data.prefixDigit < 0 || data.prefixDigit > 9) {
    throw new ScaleBarcodeConfigValidationError(
      "O número inicial deve ser um único dígito, de 0 a 9.",
    );
  }
  if (
    !Number.isInteger(data.totalLength) ||
    data.totalLength < MIN_TOTAL_LENGTH ||
    data.totalLength > MAX_TOTAL_LENGTH
  ) {
    throw new ScaleBarcodeConfigValidationError(
      `O tamanho total do código deve ficar entre ${MIN_TOTAL_LENGTH} e ${MAX_TOTAL_LENGTH} dígitos.`,
    );
  }

  checkDigitRange("código do produto", data.productCodeStart, data.productCodeEnd, data.totalLength);
  checkDigitRange("peso ou valor", data.valueStart, data.valueEnd, data.totalLength);

  const valueDigitCount = data.valueEnd - data.valueStart + 1;
  if (
    !Number.isInteger(data.decimalPlaces) ||
    data.decimalPlaces < 0 ||
    data.decimalPlaces > valueDigitCount
  ) {
    throw new ScaleBarcodeConfigValidationError(
      "As casas decimais não podem ser maiores que a quantidade de dígitos do campo de peso ou valor.",
    );
  }
}
