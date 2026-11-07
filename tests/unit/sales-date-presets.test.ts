import { describe, expect, it } from "vitest";
import { resolveSalesDatePreset } from "@/domain/pdv/sales-date-presets";

// Tela de gestão de vendas do PDV (pedido do usuário, 2026-11-08) —
// "semana atual", "mês atual", "mês anterior".
describe("resolveSalesDatePreset", () => {
  it("semana atual: segunda a domingo, numa quarta-feira", () => {
    // 2026-11-11 é uma quarta-feira.
    expect(resolveSalesDatePreset("current_week", "2026-11-11")).toEqual({
      from: "2026-11-09", // segunda
      to: "2026-11-15", // domingo
    });
  });

  it("semana atual: num domingo, continua a MESMA semana (não a seguinte)", () => {
    // 2026-11-15 é domingo — a semana que já começou na segunda 09.
    expect(resolveSalesDatePreset("current_week", "2026-11-15")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("semana atual: numa segunda-feira, começa nela mesma", () => {
    expect(resolveSalesDatePreset("current_week", "2026-11-09")).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("mês atual: dia 1 ao último dia do mês (30 dias, novembro)", () => {
    expect(resolveSalesDatePreset("current_month", "2026-11-11")).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("mês atual: fevereiro em ano bissexto termina dia 29", () => {
    expect(resolveSalesDatePreset("current_month", "2028-02-15")).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("mês anterior: de novembro volta pra outubro", () => {
    expect(resolveSalesDatePreset("previous_month", "2026-11-11")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("mês anterior: em janeiro volta pra dezembro do ano anterior (virada de ano)", () => {
    expect(resolveSalesDatePreset("previous_month", "2026-01-15")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});
