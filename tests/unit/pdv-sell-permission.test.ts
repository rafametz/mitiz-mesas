import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from "@/domain/auth/permissions";

// PDV (Fase 2 do roadmap MITIZ Gestão, decidido com o usuário 2026-10-15):
// só Administrador e Caixa vendem no balcão.
describe("pdv.sell", () => {
  it("é concedida a Administrador e Caixa", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.PDV_SELL);
    expect(ROLE_PERMISSIONS.CASHIER).toContain(PERMISSIONS.PDV_SELL);
  });

  it("não é concedida a Garçom nem Produção", () => {
    expect(ROLE_PERMISSIONS.WAITER).not.toContain(PERMISSIONS.PDV_SELL);
    expect(ROLE_PERMISSIONS.KITCHEN).not.toContain(PERMISSIONS.PDV_SELL);
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.PDV_SELL)).toBe(false);
  });

  it("código técnico segue o padrão dos demais (pdv.*)", () => {
    expect(PERMISSIONS.PDV_SELL).toBe("pdv.sell");
  });
});
