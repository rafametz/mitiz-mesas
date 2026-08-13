// Utilitários de data/hora — armazenamento em UTC, exibição sempre em
// America/Sao_Paulo (CLAUDE.md regra 23). Único lugar do código que deveria
// formatar horário para tela; evita fuso inconsistente espalhado pelas
// páginas.
export const TIMEZONE = "America/Sao_Paulo";

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Tempo decorrido desde `since`, em texto curto ("12 min", "1h05").
export function formatElapsed(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes.toString().padStart(2, "0")}`;
}

// "AAAA-MM-DD" de hoje, já em America/Sao_Paulo (não UTC do servidor) —
// valor padrão de filtro de data (histórico geral, fila de impressão).
// Locale en-CA formata datas como AAAA-MM-DD nativamente, sem montar a
// string na mão.
export function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

// Início (inclusive) e fim (exclusivo) de um dia civil em America/Sao_Paulo,
// como instantes UTC — para filtrar colunas armazenadas em UTC
// (`openedAt`, `createdAt`) por "dia local" independente do fuso do
// servidor. `-03:00` fixo de propósito: o Brasil aboliu o horário de verão
// nacionalmente em 2019, então São Paulo não muda de offset mais.
export function saoPauloDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// Mesma ideia de saoPauloDayRange, mas para um intervalo de dias
// (relatórios, Módulo 11) — início do primeiro dia até o fim do último
// (inclusive), os dois em America/Sao_Paulo.
export function saoPauloDateRange(fromStr: string, toStr: string): { start: Date; end: Date } {
  return { start: saoPauloDayRange(fromStr).start, end: saoPauloDayRange(toStr).end };
}

// "AAAA-MM-DD" de N dias atrás, em America/Sao_Paulo — usado para o
// padrão "últimos 7 dias" dos filtros de relatório.
export function daysAgoSaoPaulo(days: number): string {
  const { start } = saoPauloDayRange(todaySaoPaulo());
  const past = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(past);
}

// "AAAA-MM-DD" -> "DD/MM", pra rótulo de eixo/linha de relatório sem
// precisar de hora (diferente de formatDateTime, que sempre mostra hora).
export function formatDateKeyShort(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}
