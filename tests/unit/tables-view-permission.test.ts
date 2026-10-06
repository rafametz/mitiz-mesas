import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from "@/domain/auth/permissions";

// Leitura de mesas, comandas e históricos exige tables.view (varredura de
// segurança 2026-10-06). Produção não pode ler faturamento de mesas.
describe("tables.view", () => {
  it("é concedida a Administrador, Caixa e Garçom", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.TABLES_VIEW);
    expect(ROLE_PERMISSIONS.CASHIER).toContain(PERMISSIONS.TABLES_VIEW);
    expect(ROLE_PERMISSIONS.WAITER).toContain(PERMISSIONS.TABLES_VIEW);
  });

  it("não é concedida à Produção", () => {
    expect(ROLE_PERMISSIONS.KITCHEN).not.toContain(PERMISSIONS.TABLES_VIEW);
    expect(hasPermission(ROLE_PERMISSIONS.KITCHEN, PERMISSIONS.TABLES_VIEW)).toBe(false);
  });

  it("código técnico segue o padrão dos demais (tables.*)", () => {
    expect(PERMISSIONS.TABLES_VIEW).toBe("tables.view");
  });
});
