import { describe, expect, it } from "vitest";
import {
  validateScaleBarcodeConfig,
  ScaleBarcodeConfigValidationError,
  type ScaleBarcodeConfigInput,
} from "@/domain/pdv/scale-barcode-config";

// Mesmo layout do código de barras de balança do usuário (tela
// /admin/configuracoes, 2026-11-07): dígito 1 = prefixo, faixa de dígitos
// do produto, faixa de dígitos do peso/valor, casas decimais.
const VALID: ScaleBarcodeConfigInput = {
  enabled: true,
  prefixDigit: 2,
  totalLength: 13,
  productCodeStart: 2,
  productCodeEnd: 5,
  valueStart: 9,
  valueEnd: 12,
  valueType: "WEIGHT",
  decimalPlaces: 3,
};

describe("validateScaleBarcodeConfig", () => {
  it("aceita a configuração padrão (layout do outro programa do usuário)", () => {
    expect(() => validateScaleBarcodeConfig(VALID)).not.toThrow();
  });

  it("rejeita número inicial fora de 0 a 9", () => {
    expect(() => validateScaleBarcodeConfig({ ...VALID, prefixDigit: 10 })).toThrow(
      ScaleBarcodeConfigValidationError,
    );
    expect(() => validateScaleBarcodeConfig({ ...VALID, prefixDigit: -1 })).toThrow(
      ScaleBarcodeConfigValidationError,
    );
  });

  it("rejeita tamanho total fora da faixa aceita", () => {
    expect(() => validateScaleBarcodeConfig({ ...VALID, totalLength: 5 })).toThrow(
      ScaleBarcodeConfigValidationError,
    );
    expect(() => validateScaleBarcodeConfig({ ...VALID, totalLength: 31 })).toThrow(
      ScaleBarcodeConfigValidationError,
    );
  });

  it("rejeita campo de código do produto começando no dígito 1 (reservado pro prefixo)", () => {
    expect(() =>
      validateScaleBarcodeConfig({ ...VALID, productCodeStart: 1, productCodeEnd: 4 }),
    ).toThrow(ScaleBarcodeConfigValidationError);
  });

  it("rejeita dígito final menor que o inicial", () => {
    expect(() =>
      validateScaleBarcodeConfig({ ...VALID, valueStart: 10, valueEnd: 8 }),
    ).toThrow(ScaleBarcodeConfigValidationError);
  });

  it("rejeita faixa de dígitos além do tamanho total do código", () => {
    expect(() =>
      validateScaleBarcodeConfig({ ...VALID, valueStart: 9, valueEnd: 14, totalLength: 13 }),
    ).toThrow(ScaleBarcodeConfigValidationError);
  });

  it("rejeita casas decimais maiores que a quantidade de dígitos do campo de peso/valor", () => {
    // valueStart=9, valueEnd=12 → 4 dígitos disponíveis
    expect(() => validateScaleBarcodeConfig({ ...VALID, decimalPlaces: 5 })).toThrow(
      ScaleBarcodeConfigValidationError,
    );
  });

  it("aceita zero casas decimais (código já traz unidades inteiras)", () => {
    expect(() => validateScaleBarcodeConfig({ ...VALID, decimalPlaces: 0 })).not.toThrow();
  });

  it("aceita valueType Valor (código já traz o preço calculado pela balança)", () => {
    expect(() => validateScaleBarcodeConfig({ ...VALID, valueType: "PRICE" })).not.toThrow();
  });
});
