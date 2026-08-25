import { describe, expect, it } from "vitest";
import {
  getPostLoginPath,
  hasAnyPermission,
  hasPermission,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "@/domain/auth/permissions";

describe("hasPermission", () => {
  it("retorna true quando o código está entre os concedidos", () => {
    expect(hasPermission([PERMISSIONS.ORDERS_CREATE], PERMISSIONS.ORDERS_CREATE)).toBe(true);
  });

  it("retorna false quando o código não está entre os concedidos", () => {
    expect(hasPermission([PERMISSIONS.ORDERS_CREATE], PERMISSIONS.PAYMENTS_REGISTER)).toBe(false);
  });

  it("retorna false para lista vazia de permissões", () => {
    expect(hasPermission([], PERMISSIONS.TABLES_OPEN)).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  it("retorna true se pelo menos um código bater", () => {
    expect(
      hasAnyPermission(
        [PERMISSIONS.TABLES_CLOSE],
        [PERMISSIONS.TABLES_CLOSE_REQUEST, PERMISSIONS.TABLES_CLOSE],
      ),
    ).toBe(true);
  });

  it("retorna false se nenhum código bater", () => {
    expect(
      hasAnyPermission(
        [PERMISSIONS.TABLES_OPEN],
        [PERMISSIONS.PAYMENTS_REGISTER, PERMISSIONS.DISCOUNTS_APPLY],
      ),
    ).toBe(false);
  });
});

// Trava a regra de negócio documentada em docs/product/business-rules.md §7
// — garante que ninguém altere ROLE_PERMISSIONS sem perceber que está
// divergindo da tabela de perfis do CLAUDE.md.
describe("ROLE_PERMISSIONS — regras de negócio (CLAUDE.md seção 5 / business-rules.md §7)", () => {
  it("Administrador tem todas as permissões existentes", () => {
    expect(new Set(ROLE_PERMISSIONS.ADMIN)).toEqual(new Set(Object.values(PERMISSIONS)));
  });

  it("Garçom pode abrir mesa e lançar/enviar pedido, mas não autoriza cancelamento nem fecha mesa direto", () => {
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.TABLES_OPEN)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.ORDERS_CREATE)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.ORDERS_SEND)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.ORDERS_CANCEL_AUTHORIZE)).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.TABLES_CLOSE)).toBe(false);
  });

  it("Garçom pode trocar de mesa (CLAUDE.md seção 5: 'quando autorizado'), Caixa não (decisão do usuário 2026-08-21)", () => {
    expect(hasPermission(ROLE_PERMISSIONS.WAITER, PERMISSIONS.TABLES_TRANSFER)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.TABLES_TRANSFER)).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.KITCHEN, PERMISSIONS.TABLES_TRANSFER)).toBe(false);
  });

  it("Caixa registra pagamento e fecha mesa, mas não lança pedido nem abre mesa", () => {
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.PAYMENTS_REGISTER)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.TABLES_CLOSE)).toBe(true);
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.ORDERS_CREATE)).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.TABLES_OPEN)).toBe(false);
  });

  it("Produção atualiza status de produção e reimprime quando autorizada (CLAUDE.md seção 5), mas não mexe em pedido/mesa/pagamento", () => {
    expect(new Set(ROLE_PERMISSIONS.KITCHEN)).toEqual(
      new Set([PERMISSIONS.PRODUCTION_STATUS_UPDATE, PERMISSIONS.PRINT_JOBS_MANAGE]),
    );
    expect(hasPermission(ROLE_PERMISSIONS.KITCHEN, PERMISSIONS.ORDERS_CREATE)).toBe(false);
    expect(hasPermission(ROLE_PERMISSIONS.KITCHEN, PERMISSIONS.TABLES_OPEN)).toBe(false);
  });

  it("Caixa também reimprime conferências/comprovantes (CLAUDE.md seção 5)", () => {
    expect(hasPermission(ROLE_PERMISSIONS.CASHIER, PERMISSIONS.PRINT_JOBS_MANAGE)).toBe(true);
  });
});

// Pedido do usuário: cada perfil cai direto na sua tela principal depois
// do login, sem passar pela tela "Conta".
describe("getPostLoginPath", () => {
  it("Administrador cai no painel de mesas do admin", () => {
    expect(getPostLoginPath("ADMIN")).toBe("/admin/mesas");
  });

  it("Garçom e Caixa caem no grid de mesas do app", () => {
    expect(getPostLoginPath("WAITER")).toBe("/mesas");
    expect(getPostLoginPath("CASHIER")).toBe("/mesas");
  });

  it("Produção cai na fila de produção", () => {
    expect(getPostLoginPath("KITCHEN")).toBe("/producao");
  });
});
