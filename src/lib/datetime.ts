// Utilitários de data/hora — armazenamento em UTC, exibição sempre em
// America/Sao_Paulo (CLAUDE.md regra 23). Único lugar do código que deveria
// formatar horário para tela; evita fuso inconsistente espalhado pelas
// páginas.
const TIMEZONE = "America/Sao_Paulo";

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
