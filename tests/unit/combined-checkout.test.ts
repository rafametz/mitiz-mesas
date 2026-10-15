import { describe, expect, it } from "vitest";
import {
  isValidPdvPaymentLine,
  isValidTablePaymentLine,
} from "@/domain/service-session/combined-checkout";

describe("isValidTablePaymentLine", () => {
  it("válido só com allocations não vazio — mesa nunca paga por valor livre no checkout combinado", () => {
    expect(isValidTablePaymentLine({ allocations: [{ type: "UNITS" }] })).toBe(true);
    expect(isValidTablePaymentLine({ allocations: [] })).toBe(false);
    expect(isValidTablePaymentLine({ allocations: null })).toBe(false);
    expect(isValidTablePaymentLine({})).toBe(false);
  });
});

describe("isValidPdvPaymentLine", () => {
  it("válido só com amount definido e sem allocations — loja não tem seleção de itens de mesa", () => {
    expect(isValidPdvPaymentLine({ amount: 10 })).toBe(true);
    expect(isValidPdvPaymentLine({ amount: 0 })).toBe(true);
    expect(isValidPdvPaymentLine({ amount: undefined })).toBe(false);
    expect(isValidPdvPaymentLine({})).toBe(false);
    expect(isValidPdvPaymentLine({ amount: 10, allocations: [{ type: "UNITS" }] })).toBe(false);
    expect(isValidPdvPaymentLine({ amount: 10, allocations: [] })).toBe(true);
  });
});
