import { describe, expect, it } from "vitest";
import { resolveReportDateRange } from "@/app/admin/relatorios/date-range";

describe("resolveReportDateRange", () => {
  it("usa os padrões (últimos 7 dias) quando de/ate não vêm na URL", () => {
    const result = resolveReportDateRange({});
    expect(result.invalid).toBe(false);
    expect(result.from <= result.to).toBe(true);
  });

  it("intervalo válido (de <= ate) não é marcado como inválido", () => {
    const result = resolveReportDateRange({ de: "2026-08-27", ate: "2026-08-28" });
    expect(result).toEqual({ from: "2026-08-27", to: "2026-08-28", invalid: false });
  });

  it("mesma data nos dois campos é válida", () => {
    const result = resolveReportDateRange({ de: "2026-08-27", ate: "2026-08-27" });
    expect(result.invalid).toBe(false);
  });

  it("de depois de ate é marcado como inválido, sem travar os valores", () => {
    const result = resolveReportDateRange({ de: "2026-08-28", ate: "2026-08-27" });
    expect(result).toEqual({ from: "2026-08-28", to: "2026-08-27", invalid: true });
  });
});
