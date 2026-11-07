import { describe, expect, it } from "vitest";
import {
  digitsFromValue,
  digitsToUnits,
  formatDigits,
  unitsToDigits,
} from "@/lib/money-mask";

// Máscara de dígito-entra-pela-direita compartilhada entre MoneyField/
// MaskedMoneyInput (2 casas, dinheiro) e MaskedWeightInput (3 casas, peso
// do PDV por quilo — pedido do usuário 2026-11-08: "mesmo formato do
// real, só que o real é 2 casas decimais, o do peso vai ser 3").
describe("money-mask (2 casas, padrão — dinheiro)", () => {
  it("formata dígitos crus em centavos como R$ pt-BR", () => {
    expect(formatDigits("1234").display).toBe("12,34");
    expect(formatDigits("5").display).toBe("0,05");
    expect(formatDigits("").display).toBe("0,00");
  });

  it("digitsFromValue converte decimal pra dígitos crus", () => {
    expect(digitsFromValue("12.34")).toBe("1234");
    expect(digitsFromValue("0.05")).toBe("5");
    expect(digitsFromValue("")).toBe("");
  });

  it("digitsToUnits/unitsToDigits fazem ida e volta", () => {
    expect(digitsToUnits("1234")).toBe(1234);
    expect(unitsToDigits(1234)).toBe("1234");
    expect(unitsToDigits(0)).toBe("");
  });
});

describe("money-mask (3 casas — peso em kg, MaskedWeightInput)", () => {
  it("formata dígitos crus em gramas como kg pt-BR", () => {
    expect(formatDigits("350", 3).display).toBe("0,350");
    expect(formatDigits("866", 3).display).toBe("0,866");
    expect(formatDigits("1500", 3).display).toBe("1,500");
    expect(formatDigits("", 3).display).toBe("0,000");
  });

  it("digitsToUnits/unitsToDigits fazem ida e volta em gramas", () => {
    expect(digitsToUnits("866")).toBe(866);
    expect(unitsToDigits(866)).toBe("866");
  });

  it("dígito sempre entra pela direita — digitar 3,5,0 forma 0,350 kg", () => {
    // Simula a digitação dígito a dígito (mesmo que o onChange do campo
    // faz): cada tecla concatena à direita dos dígitos já digitados.
    let digits = "";
    for (const key of ["3", "5", "0"]) {
      digits = (digits + key).slice(-6);
    }
    expect(formatDigits(digits, 3).display).toBe("0,350");
  });
});
