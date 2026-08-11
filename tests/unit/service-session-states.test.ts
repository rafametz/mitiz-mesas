import { describe, expect, it } from "vitest";
import {
  canTransitionServiceSession,
  isServiceSessionActive,
} from "@/domain/service-session/states";
import { canOpenTable } from "@/domain/table/states";

describe("canTransitionServiceSession", () => {
  it("permite o caminho linear (business-rules.md §1, revisão 2026-08-10)", () => {
    expect(canTransitionServiceSession("OPEN", "CLOSING")).toBe(true);
    expect(canTransitionServiceSession("CLOSING", "CLOSED")).toBe(true);
  });

  it("permite as exceções documentadas", () => {
    expect(canTransitionServiceSession("OPEN", "CANCELLED")).toBe(true);
    expect(canTransitionServiceSession("CLOSED", "REOPENED")).toBe(true);
    expect(canTransitionServiceSession("REOPENED", "OPEN")).toBe(true);
    // CLOSING -> OPEN: cancelar a solicitação de fechamento sem precisar
    // fechar e reabrir o atendimento inteiro (revisão 2026-08-10).
    expect(canTransitionServiceSession("CLOSING", "OPEN")).toBe(true);
  });

  it("rejeita transições inválidas", () => {
    expect(canTransitionServiceSession("OPEN", "CLOSED")).toBe(false);
    expect(canTransitionServiceSession("CLOSED", "OPEN")).toBe(false);
    expect(canTransitionServiceSession("CANCELLED", "OPEN")).toBe(false);
    expect(canTransitionServiceSession("CLOSED", "CLOSING")).toBe(false);
  });

  it("CANCELLED e CLOSED (exceto REOPENED) são estados terminais", () => {
    expect(canTransitionServiceSession("CANCELLED", "CLOSED")).toBe(false);
    expect(canTransitionServiceSession("CLOSED", "CLOSING")).toBe(false);
  });
});

describe("isServiceSessionActive", () => {
  it("considera ativos OPEN e CLOSING", () => {
    expect(isServiceSessionActive("OPEN")).toBe(true);
    expect(isServiceSessionActive("CLOSING")).toBe(true);
  });

  it("não considera ativos os demais estados", () => {
    expect(isServiceSessionActive("CLOSED")).toBe(false);
    expect(isServiceSessionActive("REOPENED")).toBe(false);
    expect(isServiceSessionActive("CANCELLED")).toBe(false);
  });
});

describe("canOpenTable", () => {
  it("só permite abrir mesa livre", () => {
    expect(canOpenTable("FREE")).toBe(true);
  });

  it("rejeita todos os outros estados de mesa", () => {
    expect(canOpenTable("OCCUPIED")).toBe(false);
    expect(canOpenTable("WAITING_SERVICE")).toBe(false);
    expect(canOpenTable("ORDER_IN_PROGRESS")).toBe(false);
    expect(canOpenTable("WAITING_CLOSING")).toBe(false);
    expect(canOpenTable("RESERVED")).toBe(false);
    expect(canOpenTable("BLOCKED")).toBe(false);
  });
});
