import { describe, expect, it } from "vitest";
import { saoPauloDayRange, todaySaoPaulo } from "@/lib/datetime";

describe("todaySaoPaulo", () => {
  it("devolve uma data no formato AAAA-MM-DD", () => {
    expect(todaySaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("saoPauloDayRange", () => {
  it("início e fim cobrem exatamente 24h", () => {
    const { start, end } = saoPauloDayRange("2026-08-11");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("início do dia em São Paulo é 03:00 UTC (offset fixo -03:00)", () => {
    const { start } = saoPauloDayRange("2026-08-11");
    expect(start.toISOString()).toBe("2026-08-11T03:00:00.000Z");
  });

  it("um instante às 23h de São Paulo cai dentro do intervalo do mesmo dia", () => {
    const { start, end } = saoPauloDayRange("2026-08-11");
    const lateNight = new Date("2026-08-12T01:59:00.000Z"); // 22h59 em SP
    expect(lateNight.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(lateNight.getTime()).toBeLessThan(end.getTime());
  });

  it("meia-noite em São Paulo já cai no dia seguinte (fora do intervalo)", () => {
    const { end } = saoPauloDayRange("2026-08-11");
    const nextDayMidnightSP = new Date("2026-08-12T03:00:00.000Z");
    expect(nextDayMidnightSP.getTime()).toBe(end.getTime());
  });
});
