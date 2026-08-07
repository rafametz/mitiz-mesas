import { describe, expect, it } from "vitest";
import {
  canCloseTable,
  canModifyClosingCharges,
  canRegisterPayment,
  canRequestClosing,
  statusAfterPayment,
} from "@/domain/service-session/closing";

describe("canRequestClosing", () => {
  it("só a partir de OPEN", () => {
    expect(canRequestClosing("OPEN")).toBe(true);
    expect(canRequestClosing("WAITING_CLOSING")).toBe(false);
    expect(canRequestClosing("PARTIALLY_PAID")).toBe(false);
    expect(canRequestClosing("PAID")).toBe(false);
    expect(canRequestClosing("CLOSED")).toBe(false);
  });
});

describe("canModifyClosingCharges / canRegisterPayment", () => {
  it("só depois do fechamento solicitado", () => {
    for (const status of ["WAITING_CLOSING", "PARTIALLY_PAID"] as const) {
      expect(canModifyClosingCharges(status)).toBe(true);
      expect(canRegisterPayment(status)).toBe(true);
    }
    for (const status of ["OPEN", "PAID", "CLOSED", "CANCELLED"] as const) {
      expect(canModifyClosingCharges(status)).toBe(false);
      expect(canRegisterPayment(status)).toBe(false);
    }
  });
});

describe("canCloseTable", () => {
  it("regra 11: só fecha com status PAID e saldo exatamente zero", () => {
    expect(canCloseTable("PAID", "0")).toBe(true);
    expect(canCloseTable("PAID", "0.00")).toBe(true);
    expect(canCloseTable("PAID", "0.01")).toBe(false);
    expect(canCloseTable("PARTIALLY_PAID", "0")).toBe(false);
    expect(canCloseTable("WAITING_CLOSING", "0")).toBe(false);
  });
});

describe("statusAfterPayment", () => {
  it("PAID quando o saldo zera, PARTIALLY_PAID enquanto sobra", () => {
    expect(statusAfterPayment("0")).toBe("PAID");
    expect(statusAfterPayment("0.00")).toBe("PAID");
    expect(statusAfterPayment("10.50")).toBe("PARTIALLY_PAID");
  });
});
