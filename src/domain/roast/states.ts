import { RoastReservationStatus } from "@prisma/client";

// Máquina de estados da reserva de assado (módulo Reservas de Assados,
// 2026-09-29 — proposta aprovada pelo usuário):
//
//   PENDING → DELIVERED
//   PENDING → CANCELLED
//
// Sem caminho de volta: DELIVERED é definitivo no v1 (decisão explícita do
// usuário — "travada de vez", sem reabertura) e CANCELLED também nunca
// volta a PENDING (mesmo racional de OrderItem — regra 6/7 do CLAUDE.md,
// nada cancelado ressuscita, uma reserva nova é o caminho normal).
const TRANSITIONS: Record<RoastReservationStatus, RoastReservationStatus[]> = {
  PENDING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionRoastReservation(
  from: RoastReservationStatus,
  to: RoastReservationStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

// Só uma reserva PENDING pode ser editada (itens/quantidades) ou
// cancelada — DELIVERED é definitivo, CANCELLED já é terminal.
export function isRoastReservationEditable(status: RoastReservationStatus): boolean {
  return status === "PENDING";
}
