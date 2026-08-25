import { describe, expect, it } from "vitest";
import { canTransferTable } from "@/domain/service-session/transfer";

describe("canTransferTable", () => {
  it("permite trocar de mesa com atendimento OPEN", () => {
    expect(canTransferTable("OPEN")).toBe(true);
  });

  it("permite trocar de mesa com fechamento solicitado (CLOSING)", () => {
    expect(canTransferTable("CLOSING")).toBe(true);
  });

  it("não permite trocar de mesa de atendimento já fechado", () => {
    expect(canTransferTable("CLOSED")).toBe(false);
  });

  it("não permite trocar de mesa de atendimento cancelado", () => {
    expect(canTransferTable("CANCELLED")).toBe(false);
  });

  it("não permite trocar de mesa de atendimento reaberto (REOPENED)", () => {
    expect(canTransferTable("REOPENED")).toBe(false);
  });
});
