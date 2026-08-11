import { describe, expect, it } from "vitest";
import { bareTableNumber, formatTableLabel } from "@/domain/table/labels";

describe("bareTableNumber", () => {
  it("mantém um número puro sem alteração", () => {
    expect(bareTableNumber("1")).toBe("1");
  });

  it("mantém um nome livre sem prefixo 'mesa'", () => {
    expect(bareTableNumber("Varanda 3")).toBe("Varanda 3");
  });

  it("remove um prefixo 'Mesa ' já digitado no cadastro", () => {
    expect(bareTableNumber("Mesa 1")).toBe("1");
  });

  it("remove o prefixo ignorando maiúsculas/minúsculas", () => {
    expect(bareTableNumber("mesa 7")).toBe("7");
    expect(bareTableNumber("MESA 7")).toBe("7");
  });

  it("não deixa string vazia quando o valor é só 'Mesa'", () => {
    expect(bareTableNumber("Mesa")).toBe("Mesa");
  });
});

describe("formatTableLabel", () => {
  it("prefixa 'Mesa ' para um número puro", () => {
    expect(formatTableLabel("1")).toBe("Mesa 1");
  });

  it("prefixa 'Mesa ' para um nome livre", () => {
    expect(formatTableLabel("Varanda 3")).toBe("Mesa Varanda 3");
  });

  it("não duplica 'Mesa' quando já digitado no cadastro (regressão 2026-08-11)", () => {
    expect(formatTableLabel("Mesa 1")).toBe("Mesa 1");
    expect(formatTableLabel("mesa 1")).toBe("Mesa 1");
  });
});
