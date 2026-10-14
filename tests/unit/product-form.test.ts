import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  firstZodMessage,
  parseProductFormData,
  uniqueConstraintMessage,
} from "@/domain/product/product-form";

function baseFormData(overrides: Record<string, string> = {}): FormData {
  const fields: Record<string, string> = {
    name: "Picanha",
    unit: "KG",
    categoryId: "cat_1",
    defaultSectorId: "sector_1",
    price: "89.90",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  if (overrides.available === undefined) formData.set("available", "on");
  if (overrides.active === undefined) formData.set("active", "on");
  return formData;
}

describe("parseProductFormData", () => {
  it("aceita o mínimo obrigatório e deixa os opcionais como null, não undefined", () => {
    const data = parseProductFormData(baseFormData());
    expect(data.name).toBe("Picanha");
    expect(data.price).toBe("89.90");
    // A correção do bug: campo opcional vazio precisa virar `null`, porque
    // `undefined` faz o Prisma ignorar o campo no update() e o valor
    // antigo sobreviveria mesmo depois de a pessoa apagar o campo no
    // formulário de edição.
    expect(data.sku).toBeNull();
    expect(data.barcode).toBeNull();
    expect(data.costPrice).toBeNull();
    expect(data.stockQuantity).toBeNull();
    expect(data.origin).toBeNull();
    expect(data.sku).not.toBeUndefined();
  });

  it("aceita estoque negativo (dado real, não erro de digitação)", () => {
    const data = parseProductFormData(baseFormData({ stockQuantity: "-31.606" }));
    expect(data.stockQuantity).toBe("-31.606");
  });

  it("rejeita preço com mais de 2 casas decimais", () => {
    expect(() => parseProductFormData(baseFormData({ price: "10.999" }))).toThrow();
  });

  it("rejeita estoque negativo com mais de 3 casas decimais", () => {
    expect(() => parseProductFormData(baseFormData({ stockQuantity: "-1.2345" }))).toThrow();
  });

  it("aceita código de barras GTIN-13 e rejeita comprimento inválido", () => {
    const valid = parseProductFormData(baseFormData({ barcode: "7898964646081" }));
    expect(valid.barcode).toBe("7898964646081");

    expect(() => parseProductFormData(baseFormData({ barcode: "123456789" }))).toThrow();
  });

  it("aceita origem de 0 a 8 e rejeita fora da faixa", () => {
    const data = parseProductFormData(baseFormData({ origin: "5" }));
    expect(data.origin).toBe(5);

    expect(() => parseProductFormData(baseFormData({ origin: "9" }))).toThrow();
  });

  it("exige nome, categoria e setor", () => {
    expect(() => parseProductFormData(baseFormData({ name: "" }))).toThrow();
    expect(() => parseProductFormData(baseFormData({ categoryId: "" }))).toThrow();
    expect(() => parseProductFormData(baseFormData({ defaultSectorId: "" }))).toThrow();
  });
});

describe("firstZodMessage", () => {
  it("devolve a primeira mensagem de erro do Zod", () => {
    try {
      parseProductFormData(baseFormData({ name: "" }));
      throw new Error("deveria ter lançado");
    } catch (error) {
      expect(firstZodMessage(error)).toBe("Nome é obrigatório");
    }
  });

  it("devolve null para erro que não é do Zod", () => {
    expect(firstZodMessage(new Error("outra coisa"))).toBeNull();
  });
});

describe("uniqueConstraintMessage", () => {
  function p2002(target: string[]) {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target },
    });
  }

  it("identifica conflito de código (sku)", () => {
    expect(uniqueConstraintMessage(p2002(["restaurantId", "sku"]))).toBe(
      "Já existe um produto com este código.",
    );
  });

  it("identifica conflito de código de barras", () => {
    expect(uniqueConstraintMessage(p2002(["restaurantId", "barcode"]))).toBe(
      "Já existe um produto com este código de barras.",
    );
  });

  it("devolve mensagem genérica para outro alvo de conflito", () => {
    expect(uniqueConstraintMessage(p2002(["restaurantId", "name"]))).toBe(
      "Já existe um produto com esses dados.",
    );
  });

  it("devolve null para erro que não é P2002", () => {
    expect(uniqueConstraintMessage(new Error("qualquer coisa"))).toBeNull();
  });
});
