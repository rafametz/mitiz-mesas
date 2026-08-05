import { ServiceSessionStatus } from "@prisma/client";

// Máquina de estados do atendimento — CLAUDE.md seção 7 e
// docs/product/business-rules.md §1:
// OPEN → WAITING_CLOSING → PARTIALLY_PAID → PAID → CLOSED
// Exceções: REOPENED (a partir de CLOSED, só admin — checagem de permissão
// fica na aplicação, não aqui), CANCELLED (a partir de OPEN, sem pedidos
// enviados — checagem de "sem pedidos" fica na aplicação, no Módulo 4+).
//
// WAITING_CLOSING → PAID direto é permitido (pagar tudo de uma vez, sem
// passar por um pagamento parcial antes) — não contradiz o diagrama, só
// não está redundantemente listado nele.
const TRANSITIONS: Record<ServiceSessionStatus, ServiceSessionStatus[]> = {
  OPEN: ["WAITING_CLOSING", "CANCELLED"],
  WAITING_CLOSING: ["PARTIALLY_PAID", "PAID"],
  PARTIALLY_PAID: ["PAID"],
  PAID: ["CLOSED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["OPEN"],
  CANCELLED: [],
};

export function canTransitionServiceSession(
  from: ServiceSessionStatus,
  to: ServiceSessionStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export const ACTIVE_SERVICE_SESSION_STATUSES: readonly ServiceSessionStatus[] = [
  "OPEN",
  "WAITING_CLOSING",
  "PARTIALLY_PAID",
];

// Regra 1 do CLAUDE.md: uma mesa só pode ter um atendimento ativo por vez.
// "Ativo" = qualquer um destes três estados.
export function isServiceSessionActive(status: ServiceSessionStatus): boolean {
  return ACTIVE_SERVICE_SESSION_STATUSES.includes(status);
}
