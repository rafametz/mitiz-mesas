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

// Table.number é livre (schema.prisma: "número ou nome livre", ex.: "1",
// "Varanda 3") mas várias telas compõem "Mesa {number}" na hora de exibir
// (cabeçalho da mesa, Novo pedido, diálogos de fechamento). Se alguém
// cadastra a mesa já como "Mesa 1" (rótulo do formulário não deixava claro
// que "Mesa" é automático), o resultado duplicava: "Mesa Mesa 1" (feedback
// do usuário, 2026-08-11). Esta função remove um "mesa"/"Mesa" já presente
// no início do valor livre antes de compor, então funciona com o dado como
// ele já estiver hoje, sem precisar renomear nada.
export function bareTableNumber(number: string): string {
  const trimmed = number.trim();
  const stripped = trimmed.replace(/^mesa\s*/i, "");
  return stripped || trimmed;
}

// "Mesa {number}" para uso como rótulo isolado (título, subtítulo). Para
// compor dentro de uma frase que já tem a palavra "mesa" (ex.: "A mesa X
// será liberada..."), usar bareTableNumber diretamente.
export function formatTableLabel(number: string): string {
  return `Mesa ${bareTableNumber(number)}`;
}
