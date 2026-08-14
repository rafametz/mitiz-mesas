// Nomes de canal do Supabase Realtime — centralizados aqui para que quem
// publica (servidor, após a transação) e quem assina (cliente) nunca
// divergirem. Puro, sem I/O: testável sem banco (mesmo racional do
// src/domain).
//
// CLAUDE.md: "canais escopados por mesa e por setor". `sectorChannel`
// ainda não é assinado por nenhuma tela (isso é do Módulo 6 — Produção),
// mas já fica pronto: os pontos que publicam eventos de item de pedido já
// sabem o setor no momento da mutação.
export function tableChannel(tableId: string): string {
  return `table:${tableId}`;
}

export function restaurantTablesChannel(restaurantId: string): string {
  return `restaurant:${restaurantId}:tables`;
}

export function sectorChannel(sectorId: string): string {
  return `sector:${sectorId}`;
}

// Módulo Retiradas (2026-08-14) — mesmo par table/restaurantTables, só que
// para atendimento sem mesa: um canal por retirada (tela de detalhe) e um
// por restaurante (lista /retiradas e /admin/retiradas).
export function pickupChannel(serviceSessionId: string): string {
  return `pickup:${serviceSessionId}`;
}

export function restaurantPickupsChannel(restaurantId: string): string {
  return `restaurant:${restaurantId}:pickups`;
}

// Nome do evento de broadcast em todos os canais acima. Um só nome — o
// payload carrega só um `type` textual (ex.: "table.opened",
// "order.created"), nunca dado de negócio (ver src/lib/realtime/publish.ts).
export const REALTIME_EVENT = "change";
