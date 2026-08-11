import { ServiceSessionStatus } from "@prisma/client";

// Máquina de estados do atendimento — CLAUDE.md seção 7 e
// docs/product/business-rules.md §1 (revisão 2026-08-10, separação
// PAGAMENTO/FECHAMENTO — ver docs/architecture/decisions/):
//
//   OPEN → CLOSING → CLOSED → REOPENED → OPEN
//   OPEN → CANCELLED
//
// PARTIALLY_PAID/PAID saíram do enum: eram um subproduto do saldo
// (paidAmount/balanceAmount), não um estado que deveria bloquear ou
// liberar ação — registrar pagamento nunca muda este status (ver
// register-payment.ts). CLOSING é o único estado (além de CLOSED/
// CANCELLED) em que novo pedido é bloqueado.
//
// CLOSING → OPEN existe de propósito: solicitar fechamento não é uma
// decisão irreversível — o cliente pode pedir mais alguma coisa depois de
// já ter pedido a conta, sem precisar passar por fechar e reabrir o
// atendimento inteiro (isso é CLOSED → REOPENED → OPEN, uma operação bem
// mais pesada, só admin).
const TRANSITIONS: Record<ServiceSessionStatus, ServiceSessionStatus[]> = {
  OPEN: ["CLOSING", "CANCELLED"],
  CLOSING: ["OPEN", "CLOSED"],
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
  "CLOSING",
];

// Regra 1 do CLAUDE.md: uma mesa só pode ter um atendimento ativo por vez.
// "Ativo" = qualquer um destes dois estados.
export function isServiceSessionActive(status: ServiceSessionStatus): boolean {
  return ACTIVE_SERVICE_SESSION_STATUSES.includes(status);
}
