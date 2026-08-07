// O agente local consulta a fila a cada POLL_INTERVAL_MS (5000 por padrão,
// ver printer-agent/.env.example) — se o heartbeat (Printer.lastSeenAt) for
// mais antigo que alguns ciclos de consulta, o processo provavelmente caiu
// ou o computador está desligado. Folga de 4x o intervalo default absorve
// uma consulta perdida por latência de rede sem gerar alarme falso.
export const AGENT_OFFLINE_THRESHOLD_MS = 20_000;

export type AgentStatus = "online" | "offline" | "never_connected";

export function getAgentStatus(lastSeenAt: Date | null, now: Date = new Date()): AgentStatus {
  if (!lastSeenAt) return "never_connected";
  const elapsedMs = now.getTime() - lastSeenAt.getTime();
  return elapsedMs <= AGENT_OFFLINE_THRESHOLD_MS ? "online" : "offline";
}

// Texto curto ("há 4s", "há 12min") para mostrar ao lado do status —
// mesma ideia de formatDateTime (src/lib/datetime.ts), mas relativo, porque
// o que importa aqui é "faz quanto tempo", não o horário exato.
export function formatElapsedSince(lastSeenAt: Date, now: Date = new Date()): string {
  const elapsedMs = Math.max(0, now.getTime() - lastSeenAt.getTime());
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}
