import { describe, expect, it } from "vitest";
import { canTransitionPrintJob } from "@/domain/printing/states";

describe("canTransitionPrintJob", () => {
  it("PENDING -> PROCESSING (agente pega o job)", () => {
    expect(canTransitionPrintJob("PENDING", "PROCESSING")).toBe(true);
  });

  it("PROCESSING -> PRINTED ou FAILED (agente confirma)", () => {
    expect(canTransitionPrintJob("PROCESSING", "PRINTED")).toBe(true);
    expect(canTransitionPrintJob("PROCESSING", "FAILED")).toBe(true);
  });

  it("FAILED -> PENDING (reprocessar manual)", () => {
    expect(canTransitionPrintJob("FAILED", "PENDING")).toBe(true);
  });

  it("rejeita pular etapa (PENDING direto para PRINTED)", () => {
    expect(canTransitionPrintJob("PENDING", "PRINTED")).toBe(false);
  });

  it("PRINTED é terminal", () => {
    expect(canTransitionPrintJob("PRINTED", "PENDING")).toBe(false);
    expect(canTransitionPrintJob("PRINTED", "PROCESSING")).toBe(false);
  });
});
