// Catálogo de permissões e o que cada perfil (Role) tem por padrão.
// Fonte da regra: docs/product/business-rules.md §7 (tabela de perfis) e
// CLAUDE.md seção 5. Este arquivo é a fonte única usada tanto pelo seed
// (prisma/seed.ts, que grava isso no banco) quanto por qualquer checagem de
// permissão na aplicação — regra de negócio pura, sem I/O, testável sem
// banco (CLAUDE.md seção 24: frontend nunca é a única camada de validação;
// isto é o que roda no backend).
//
// "Solicita" na tabela de perfis (ex.: garçom solicitando fechamento de
// mesa ou cancelamento) não vira uma permissão de executar a ação — vira um
// código de permissão separado, mais restrito, para a ação de "pedir".

export const PERMISSIONS = {
  TABLES_OPEN: "tables.open",
  TABLES_CLOSE: "tables.close",
  TABLES_CLOSE_REQUEST: "tables.close.request",
  TABLES_REOPEN: "tables.reopen",
  TABLES_TRANSFER: "tables.transfer",
  ORDERS_CREATE: "orders.create",
  ORDERS_SEND: "orders.send",
  ORDERS_CANCEL_REQUEST: "orders.cancel.request",
  ORDERS_CANCEL_AUTHORIZE: "orders.cancel.authorize",
  PRODUCTION_STATUS_UPDATE: "production.status.update",
  // Ver a fila de impressão, reprocessar falha, reimprimir manualmente
  // (CLAUDE.md seção 5 — Caixa "reimprime conferências e comprovantes",
  // Produção "reimprime pedidos quando autorizado"; seção 10 — Impressoras
  // no cadastro de Administração).
  PRINT_JOBS_MANAGE: "print_jobs.manage",
  PAYMENTS_REGISTER: "payments.register",
  DISCOUNTS_APPLY: "discounts.apply",
  AUDIT_VIEW: "audit.view",
  // Cadastros administrativos (produtos, categorias, mesas, setores,
  // impressoras, usuários, formas de pagamento) — um único código no MVP;
  // pode ser quebrado em códigos mais finos quando as telas de admin
  // (Módulo 2+) precisarem de granularidade maior.
  ADMIN_MANAGE: "admin.manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Códigos técnicos de Role — devem bater com Role.name no banco (seed).
export const ROLE_CODES = ["ADMIN", "CASHIER", "WAITER", "KITCHEN"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "Administrador",
  CASHIER: "Caixa",
  WAITER: "Garçom",
  KITCHEN: "Produção",
};

// O que cada perfil tem por padrão — usado para popular RolePermission no
// seed. Alterações aqui exigem rodar o seed de novo para refletir no banco.
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  ADMIN: Object.values(PERMISSIONS),
  CASHIER: [
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.DISCOUNTS_APPLY,
    PERMISSIONS.TABLES_CLOSE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ],
  WAITER: [
    PERMISSIONS.TABLES_OPEN,
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_SEND,
    PERMISSIONS.ORDERS_CANCEL_REQUEST,
  ],
  KITCHEN: [PERMISSIONS.PRODUCTION_STATUS_UPDATE, PERMISSIONS.PRINT_JOBS_MANAGE],
};

// Checagem pura: dado o conjunto de códigos que o usuário tem (carregado do
// banco via Role -> RolePermission), ele tem a permissão pedida?
export function hasPermission(grantedCodes: readonly string[], code: PermissionCode): boolean {
  return grantedCodes.includes(code);
}

export function hasAnyPermission(
  grantedCodes: readonly string[],
  codes: readonly PermissionCode[],
): boolean {
  return codes.some((code) => grantedCodes.includes(code));
}
