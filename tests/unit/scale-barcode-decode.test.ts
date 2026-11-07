import { describe, expect, it } from "vitest";
import {
  decodeScaleBarcode,
  matchesEmbeddedProductCode,
  type ScaleBarcodeLayout,
} from "@/domain/pdv/scale-barcode-decode";

// Mesmo layout de exemplo da tela /admin/configuracoes (2026-11-07):
// prefixo "2", 13 dígitos, código do produto nos dígitos 2-5, peso nos
// dígitos 9-12 com 3 casas decimais.
const LAYOUT: ScaleBarcodeLayout = {
  prefixDigit: 2,
  totalLength: 13,
  productCodeStart: 2,
  productCodeEnd: 5,
  valueStart: 9,
  valueEnd: 12,
  valueType: "WEIGHT",
  decimalPlaces: 3,
};

// Monta um código de barras de teste a partir das posições do layout, em
// vez de concatenar strings na mão (fonte comum de erro de offset) —
// dígitos fora de productCode/valueDigits/prefix viram "0".
function assembleCode(
  layout: ScaleBarcodeLayout,
  parts: { productCode: string; valueDigits: string; prefix?: string },
): string {
  const chars = new Array(layout.totalLength).fill("0");
  chars[0] = parts.prefix ?? String(layout.prefixDigit);
  for (let i = layout.productCodeStart; i <= layout.productCodeEnd; i++) {
    chars[i - 1] = parts.productCode[i - layout.productCodeStart];
  }
  for (let i = layout.valueStart; i <= layout.valueEnd; i++) {
    chars[i - 1] = parts.valueDigits[i - layout.valueStart];
  }
  return chars.join("");
}

describe("decodeScaleBarcode", () => {
  it("decodifica código do produto e peso do layout configurado", () => {
    const code = assembleCode(LAYOUT, { productCode: "0002", valueDigits: "0350" });
    expect(code).toHaveLength(13);
    const result = decodeScaleBarcode(code, LAYOUT);
    expect(result).not.toBeNull();
    expect(result?.productCode).toBe("0002");
    expect(result?.value.toString()).toBe("0.35");
    expect(result?.valueType).toBe("WEIGHT");
  });

  it("retorna null quando o tamanho não bate com o total configurado", () => {
    const code = assembleCode(LAYOUT, { productCode: "0002", valueDigits: "0350" }).slice(0, -1);
    expect(decodeScaleBarcode(code, LAYOUT)).toBeNull();
  });

  it("retorna null quando o primeiro dígito não é o prefixo configurado", () => {
    const code = assembleCode(LAYOUT, { productCode: "0002", valueDigits: "0350", prefix: "7" });
    expect(decodeScaleBarcode(code, LAYOUT)).toBeNull();
  });

  it("retorna null quando o código tem caractere não numérico (leitura de SKU normal)", () => {
    expect(decodeScaleBarcode("ABC123", LAYOUT)).toBeNull();
    expect(decodeScaleBarcode("789012345678x", LAYOUT)).toBeNull();
  });

  it("decodifica valueType Valor (preço já calculado pela balança)", () => {
    const priceLayout: ScaleBarcodeLayout = { ...LAYOUT, valueType: "PRICE", decimalPlaces: 2 };
    const code = assembleCode(priceLayout, { productCode: "0002", valueDigits: "2097" });
    const result = decodeScaleBarcode(code, priceLayout);
    expect(result?.value.toString()).toBe("20.97");
    expect(result?.valueType).toBe("PRICE");
  });
});

describe("matchesEmbeddedProductCode", () => {
  it("casa por igualdade exata", () => {
    expect(matchesEmbeddedProductCode("0002", "0002")).toBe(true);
  });

  it("casa ignorando zeros à esquerda quando os dois lados são numéricos", () => {
    expect(matchesEmbeddedProductCode("2", "0002")).toBe(true);
    expect(matchesEmbeddedProductCode("0002", "2")).toBe(true);
  });

  it("não casa SKU nulo", () => {
    expect(matchesEmbeddedProductCode(null, "0002")).toBe(false);
  });

  it("não casa quando o SKU tem letras e não bate com o código numérico", () => {
    expect(matchesEmbeddedProductCode("AEA0002", "0002")).toBe(false);
  });

  it("não casa códigos numéricos diferentes", () => {
    expect(matchesEmbeddedProductCode("3", "0002")).toBe(false);
  });
});
