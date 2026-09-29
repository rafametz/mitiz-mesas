import { describe, expect, it } from "vitest";
import {
  availableQuantity,
  hasEnoughAvailability,
  isPositiveQuantity,
  isValidDateKey,
  nextSundayFrom,
} from "@/domain/roast/production";

describe("isValidDateKey", () => {
  it("aceita AAAA-MM-DD", () => {
    expect(isValidDateKey("2026-09-29")).toBe(true);
  });

  it("rejeita formatos diferentes", () => {
    expect(isValidDateKey("29-09-2026")).toBe(false);
    expect(isValidDateKey("2026/09/29")).toBe(false);
    expect(isValidDateKey("")).toBe(false);
    expect(isValidDateKey("2026-09-29T00:00:00")).toBe(false);
  });
});

describe("availableQuantity", () => {
  it("é o planejado menos o reservado", () => {
    expect(availableQuantity(10, 4).toNumber()).toBe(6);
  });

  it("não é clampada em zero (negativo é sinal de bug a ser exposto)", () => {
    expect(availableQuantity(5, 8).toNumber()).toBe(-3);
  });
});

describe("hasEnoughAvailability", () => {
  it("permite quando o pedido cabe no disponível", () => {
    expect(hasEnoughAvailability(10, 4, 6)).toBe(true);
  });

  it("permite exatamente o limite (>=)", () => {
    expect(hasEnoughAvailability(10, 4, 6.001)).toBe(false);
  });

  it("rejeita quando excede o disponível", () => {
    expect(hasEnoughAvailability(10, 8, 3)).toBe(false);
  });
});

describe("nextSundayFrom", () => {
  it("terça (29/09/2026) -> próximo domingo (04/10/2026), pedido do usuário 2026-10-04", () => {
    expect(nextSundayFrom("2026-09-29")).toBe("2026-10-04");
  });

  it("segunda (05/10/2026) -> próximo domingo (11/10/2026)", () => {
    expect(nextSundayFrom("2026-10-05")).toBe("2026-10-11");
  });

  it("já sendo domingo, devolve o mesmo dia (não pula pro seguinte)", () => {
    expect(nextSundayFrom("2026-10-04")).toBe("2026-10-04");
  });

  it("sábado -> domingo seguinte (+1 dia)", () => {
    expect(nextSundayFrom("2026-10-10")).toBe("2026-10-11");
  });
});

describe("isPositiveQuantity", () => {
  it("rejeita zero e negativos", () => {
    expect(isPositiveQuantity(0)).toBe(false);
    expect(isPositiveQuantity(-1)).toBe(false);
  });

  it("aceita positivos", () => {
    expect(isPositiveQuantity(0.5)).toBe(true);
  });
});
