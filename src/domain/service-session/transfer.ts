import type { ServiceSessionStatus } from "@prisma/client";

// Troca de mesa (2026-08-21, pedido do usuário): mover um atendimento
// ativo inteiro pra outra mesa, sem fechar/reabrir nada — só faz sentido
// enquanto o atendimento ainda está ativo. OPEN (atendimento normal) e
// CLOSING (fechamento solicitado, mas ainda não fechado — as pessoas
// podem trocar de mesa enquanto acertam a conta) são os dois casos
// válidos; depois de CLOSED/CANCELLED não há mais atendimento pra mover.
export function canTransferTable(status: ServiceSessionStatus): boolean {
  return status === "OPEN" || status === "CLOSING";
}
