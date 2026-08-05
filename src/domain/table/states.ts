import { TableStatus } from "@prisma/client";

// Só a regra que o Módulo 3 realmente precisa: uma mesa só pode ser aberta
// se estiver livre. As demais transições de status de mesa (RESERVED,
// BLOCKED, etc.) hoje são um ajuste manual do administrador (Módulo 2) —
// CLAUDE.md não define uma máquina de estados tão estrita para `Table`
// quanto define para `ServiceSession`.
export function canOpenTable(status: TableStatus): boolean {
  return status === TableStatus.FREE;
}
