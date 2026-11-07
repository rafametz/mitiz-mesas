import { Prisma } from "@prisma/client";
import { toDecimal } from "@/lib/money";
import type { ScaleBarcodeValueType } from "./scale-barcode-config";

export type ScaleBarcodeLayout = {
  prefixDigit: number;
  totalLength: number;
  productCodeStart: number;
  productCodeEnd: number;
  valueStart: number;
  valueEnd: number;
  valueType: ScaleBarcodeValueType;
  decimalPlaces: number;
};

export type DecodedScaleBarcode = {
  productCode: string;
  value: Prisma.Decimal;
  valueType: ScaleBarcodeValueType;
};

// Decodifica um código de barras gerado por balança (padrão "peso/valor
// embutido", configurado em /admin/configuracoes) — pura, sem I/O. `code`
// é a leitura crua do leitor (string, só dígitos esperado, igual ao que já
// chega no campo de busca do PDV hoje). Retorna null sempre que o código
// não bate com o layout configurado (tamanho diferente, prefixo diferente,
// caractere não numérico) — quem chama cai de volta pro casamento comum
// por SKU/código de barras inteiro (comportamento de antes desta função
// existir), nunca trata "não decodificou" como erro.
export function decodeScaleBarcode(
  code: string,
  layout: ScaleBarcodeLayout,
): DecodedScaleBarcode | null {
  if (!/^\d+$/.test(code)) return null;
  if (code.length !== layout.totalLength) return null;
  if (code[0] !== String(layout.prefixDigit)) return null;

  const productCode = code.slice(layout.productCodeStart - 1, layout.productCodeEnd);
  const valueDigits = code.slice(layout.valueStart - 1, layout.valueEnd);
  if (!productCode || !valueDigits) return null;

  // Decimal (não Number/divisão float) — mesma régua de nunca usar ponto
  // flutuante impreciso pra valor (CLAUDE.md regra 20/21); aqui vale tanto
  // pro caso "valor em R$" quanto pro peso, que também vira dinheiro
  // (peso × preço/kg) logo depois.
  const value = toDecimal(valueDigits).dividedBy(toDecimal(10).pow(layout.decimalPlaces));

  return { productCode, value, valueType: layout.valueType };
}

// Casa o código do produto extraído do código de barras com o SKU já
// cadastrado (decisão do usuário 2026-11-07: reaproveitar o SKU existente
// em vez de um campo novo só pra isso). Igualdade exata primeiro; se os
// dois lados forem puramente numéricos e isso falhar, compara o valor
// numérico — cobre o caso comum de o código embutido vir com zeros à
// esquerda ("0002") e o SKU cadastrado sem eles ("2"), ou vice-versa.
export function matchesEmbeddedProductCode(sku: string | null, productCode: string): boolean {
  if (!sku) return false;
  if (sku === productCode) return true;
  if (/^\d+$/.test(sku) && /^\d+$/.test(productCode)) {
    return Number(sku) === Number(productCode);
  }
  return false;
}
