import { describe, expect, it } from "vitest";
import {
  pdvSaleReceiptContentSchema,
  buildPdvSaleReceiptContent,
} from "@/domain/printing/pdv-sale-receipt";

describe("buildPdvSaleReceiptContent", () => {
  const lojaOrigin = {
    label: "Loja",
    items: [{ label: "1x Picanha", amount: "R$ 110,00" }],
    subtotal: "R$ 110,00",
    payments: [{ methodName: "PIX", amount: "R$ 110,00", change: null }],
  };

  const baseInput = {
    restaurantName: "MITIZ Boutique de Carnes",
    waiterName: "Fulano",
    origins: [lojaOrigin],
    total: "R$ 110,00",
  };

  it("monta um conteúdo válido conforme o schema, uma origem (venda pura)", () => {
    const content = buildPdvSaleReceiptContent(baseInput);
    expect(() => pdvSaleReceiptContentSchema.parse(content)).not.toThrow();
    expect(content.type).toBe("PDV_SALE");
    expect(content.origins).toHaveLength(1);
    expect(content.origins[0]?.label).toBe("Loja");
  });

  it("Pagamento Combinado: duas origens, mesa antes da loja, nunca misturadas", () => {
    const mesaOrigin = {
      label: "Mesa 3",
      items: [{ label: "3x Chopp Pilsen", amount: "R$ 36,00" }],
      subtotal: "R$ 36,00",
      payments: [{ methodName: "Dinheiro", amount: "R$ 36,00", change: "R$ 4,00" }],
    };
    const content = buildPdvSaleReceiptContent({
      ...baseInput,
      origins: [mesaOrigin, lojaOrigin],
      total: "R$ 146,00",
    });
    expect(content.origins).toHaveLength(2);
    expect(content.origins[0]?.label).toBe("Mesa 3");
    expect(content.origins[1]?.label).toBe("Loja");
    expect(content.origins[0]?.payments[0]?.change).toBe("R$ 4,00");
  });

  it("troco fica null quando a forma não foi em dinheiro ou não foi informado", () => {
    const content = buildPdvSaleReceiptContent(baseInput);
    expect(content.origins[0]?.payments[0]?.change).toBeNull();
  });

  it("usa a hora informada, ou a atual se omitida", () => {
    const fixedDate = new Date("2026-10-28T18:00:00.000Z");
    const content = buildPdvSaleReceiptContent({ ...baseInput, generatedAt: fixedDate });
    expect(content.generatedAt).toBe(fixedDate.toISOString());
  });

  it("rejeita quando origins está vazio", () => {
    expect(() => buildPdvSaleReceiptContent({ ...baseInput, origins: [] })).toThrow();
  });
});
