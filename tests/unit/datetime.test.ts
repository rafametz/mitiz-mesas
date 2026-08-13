import { describe, expect, it } from "vitest";
import {
  daysAgoSaoPaulo,
  formatDateKeyShort,
  saoPauloDateRange,
  saoPauloDayRange,
  todaySaoPaulo,
} from "@/lib/datetime";

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

describe("saoPauloDateRange", () => {
  it("início do primeiro dia até o fim do último (inclusive)", () => {
    const range = saoPauloDateRange("2026-08-05", "2026-08-11");
    expect(range.start.toISOString()).toBe(saoPauloDayRange("2026-08-05").start.toISOString());
    expect(range.end.toISOString()).toBe(saoPauloDayRange("2026-08-11").end.toISOString());
  });

  it("mesmo dia nos dois extremos cobre só aquele dia", () => {
    const range = saoPauloDateRange("2026-08-11", "2026-08-11");
    expect(range.end.getTime() - range.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("daysAgoSaoPaulo", () => {
  it("0 dias atrás é hoje", () => {
    expect(daysAgoSaoPaulo(0)).toBe(todaySaoPaulo());
  });

  it("7 dias atrás é exatamente uma semana antes de hoje", () => {
    const today = saoPauloDayRange(todaySaoPaulo()).start;
    const sevenDaysAgo = saoPauloDayRange(daysAgoSaoPaulo(7)).start;
    expect(today.getTime() - sevenDaysAgo.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("formatDateKeyShort", () => {
  it("converte AAAA-MM-DD em DD/MM", () => {
    expect(formatDateKeyShort("2026-08-05")).toBe("05/08");
  });
});
