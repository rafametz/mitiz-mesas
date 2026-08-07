import { describe, expect, it } from "vitest";
import {
  AGENT_OFFLINE_THRESHOLD_MS,
  formatElapsedSince,
  getAgentStatus,
} from "@/domain/printing/agent-status";

const NOW = new Date("2026-08-07T15:00:00Z");

describe("getAgentStatus", () => {
  it("nunca conectou quando lastSeenAt é nulo", () => {
    expect(getAgentStatus(null, NOW)).toBe("never_connected");
  });

  it("online dentro do limite de tolerância (folga pra uma consulta perdida)", () => {
    const lastSeenAt = new Date(NOW.getTime() - AGENT_OFFLINE_THRESHOLD_MS);
    expect(getAgentStatus(lastSeenAt, NOW)).toBe("online");
  });

  it("offline passado o limite de tolerância", () => {
    const lastSeenAt = new Date(NOW.getTime() - AGENT_OFFLINE_THRESHOLD_MS - 1);
    expect(getAgentStatus(lastSeenAt, NOW)).toBe("offline");
  });

  it("online com heartbeat recente", () => {
    const lastSeenAt = new Date(NOW.getTime() - 3_000);
    expect(getAgentStatus(lastSeenAt, NOW)).toBe("online");
  });
});

describe("formatElapsedSince", () => {
  it("segundos", () => {
    expect(formatElapsedSince(new Date(NOW.getTime() - 4_000), NOW)).toBe("há 4s");
  });

  it("minutos", () => {
    expect(formatElapsedSince(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe("há 5min");
  });

  it("horas", () => {
    expect(formatElapsedSince(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe("há 3h");
  });

  it("dias", () => {
    expect(formatElapsedSince(new Date(NOW.getTime() - 2 * 86_400_000), NOW)).toBe("há 2d");
  });
});
