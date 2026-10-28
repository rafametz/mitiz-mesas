import { describe, expect, it } from "vitest";
import { formatSessionLabel } from "@/domain/service-session/labels";

describe("formatSessionLabel", () => {
  it("mesa: usa o número formatado quando informado", () => {
    expect(formatSessionLabel({ type: "TABLE", pickupNumber: null }, "3")).toBe("Mesa 3");
  });

  it("mesa sem número: cai no rótulo genérico", () => {
    expect(formatSessionLabel({ type: "TABLE", pickupNumber: null })).toBe("Mesa");
  });

  it("retirada: usa o número sequencial", () => {
    expect(formatSessionLabel({ type: "PICKUP", pickupNumber: 47 })).toBe("Retirada #47");
  });

  it("PDV: rótulo próprio, nunca cai no genérico 'Mesa' (correção 2026-10-28 — achado implementando o recibo do PDV)", () => {
    expect(formatSessionLabel({ type: "PDV", pickupNumber: null })).toBe("PDV");
    expect(formatSessionLabel({ type: "PDV", pickupNumber: null }, undefined)).toBe("PDV");
  });
});
