import { describe, expect, it, vi } from "vitest";
import { withTimeout, WEBAUTHN_TIMEOUT_MS } from "@/lib/webauthn/biometric-lock";

describe("withTimeout", () => {
  it("resolve normalmente quando a promise original resolve antes do limite", async () => {
    const controller = new AbortController();
    const result = await withTimeout(Promise.resolve("ok"), controller);
    expect(result).toBe("ok");
    expect(controller.signal.aborted).toBe(false);
  });

  it("propaga o erro quando a promise original rejeita antes do limite", async () => {
    const controller = new AbortController();
    await expect(withTimeout(Promise.reject(new Error("negado")), controller)).rejects.toThrow(
      "negado",
    );
  });

  it("rejeita sozinha e aborta o controller quando a promise original nunca resolve nem rejeita (prompt biométrico travado, relato do usuário 2026-09-15)", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      // Simula exatamente o bug real: navigator.credentials.get() que
      // nunca resolve nem rejeita sozinho porque o prompt do sistema
      // falhou em aparecer/responder.
      const neverSettles = new Promise<string>(() => {});

      const promise = withTimeout(neverSettles, controller);
      const assertion = expect(promise).rejects.toThrow("Tempo esgotado");

      await vi.advanceTimersByTimeAsync(WEBAUTHN_TIMEOUT_MS);
      await assertion;

      expect(controller.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
