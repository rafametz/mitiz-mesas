import { describe, expect, it } from "vitest";
import {
  canCancelClosingRequest,
  canCloseTable,
  canModifyClosingCharges,
  canRegisterPayment,
  canRequestClosing,
} from "@/domain/service-session/closing";

describe("canRequestClosing", () => {
  it("só a partir de OPEN", () => {
    expect(canRequestClosing("OPEN")).toBe(true);
    expect(canRequestClosing("CLOSING")).toBe(false);
    expect(canRequestClosing("CLOSED")).toBe(false);
  });
});

describe("canCancelClosingRequest", () => {
  it("só a partir de CLOSING — volta pra OPEN sem fechar e reabrir tudo", () => {
    expect(canCancelClosingRequest("CLOSING")).toBe(true);
    expect(canCancelClosingRequest("OPEN")).toBe(false);
    expect(canCancelClosingRequest("CLOSED")).toBe(false);
  });
});

describe("canModifyClosingCharges", () => {
  it("taxa/desconto só depois do fechamento solicitado (CLOSING)", () => {
    expect(canModifyClosingCharges("CLOSING")).toBe(true);
    expect(canModifyClosingCharges("OPEN")).toBe(false);
    expect(canModifyClosingCharges("CLOSED")).toBe(false);
    expect(canModifyClosingCharges("CANCELLED")).toBe(false);
  });
});

describe("canRegisterPayment", () => {
  it("pagamento é permitido em OPEN e CLOSING — nunca exige fechamento solicitado antes (revisão 2026-08-10)", () => {
    expect(canRegisterPayment("OPEN")).toBe(true);
    expect(canRegisterPayment("CLOSING")).toBe(true);
    expect(canRegisterPayment("CLOSED")).toBe(false);
    expect(canRegisterPayment("CANCELLED")).toBe(false);
  });
});

describe("canCloseTable", () => {
  it("regra 11: só fecha com fechamento solicitado (CLOSING) e saldo exatamente zero", () => {
    expect(canCloseTable("CLOSING", "0")).toBe(true);
    expect(canCloseTable("CLOSING", "0.00")).toBe(true);
    expect(canCloseTable("CLOSING", "0.01")).toBe(false);
    expect(canCloseTable("OPEN", "0")).toBe(false);
    expect(canCloseTable("CLOSED", "0")).toBe(false);
  });

  it("saldo zero sozinho em OPEN nunca fecha a mesa (revisão 2026-08-10)", () => {
    expect(canCloseTable("OPEN", "0")).toBe(false);
    expect(canCloseTable("OPEN", "0.00")).toBe(false);
  });
});
