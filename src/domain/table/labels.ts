import { TableStatus } from "@prisma/client";

// Rótulos em português dos estados de mesa (CLAUDE.md seção 7). Nomes
// técnicos em inglês no código, texto de interface em português (seção 13).
export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  FREE: "Livre",
  OCCUPIED: "Ocupada",
  WAITING_SERVICE: "Aguardando atendimento",
  ORDER_IN_PROGRESS: "Pedido em andamento",
  WAITING_CLOSING: "Aguardando fechamento",
  RESERVED: "Reservada",
  BLOCKED: "Bloqueada",
};
