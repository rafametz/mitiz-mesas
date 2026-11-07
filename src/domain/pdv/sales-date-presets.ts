// Atalhos de período pra tela de gestão de vendas do PDV (pedido do
// usuário 2026-11-08: "filtro de data, opções de mês atual, semana atual,
// mês anterior"). Puro — sem I/O, testável sem fuso do servidor; recebe
// "hoje" já como chave "AAAA-MM-DD" em America/Sao_Paulo (resolvida por
// quem chama via `todaySaoPaulo()`, mesmo padrão de resolveReportDateRange
// em admin/relatorios/date-range.ts). `T12:00:00Z` ao converter pra Date
// evita problema de fuso na borda da meia-noite, mesmo truque já usado em
// shiftDateKey (src/lib/datetime.ts).
export type SalesDatePreset = "current_week" | "current_month" | "previous_month";

export const SALES_DATE_PRESET_LABELS: Record<SalesDatePreset, string> = {
  current_week: "Semana atual",
  current_month: "Mês atual",
  previous_month: "Mês anterior",
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Segunda a domingo da semana que contém `todayKey`.
function currentWeekRange(todayKey: string): { from: string; to: string } {
  const date = new Date(`${todayKey}T12:00:00Z`);
  const weekday = date.getUTCDay(); // 0 = domingo .. 6 = sábado
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { from: dateKey(monday), to: dateKey(sunday) };
}

// Mês civil inteiro (dia 1 ao último dia), `monthsAgo` meses antes do mês
// de `todayKey` (0 = mês atual, 1 = mês anterior).
function monthRange(todayKey: string, monthsAgo: number): { from: string; to: string } {
  const [yearStr, monthStr] = todayKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const firstOfMonth = new Date(Date.UTC(year, month - 1 - monthsAgo, 1));
  const y = firstOfMonth.getUTCFullYear();
  const m = firstOfMonth.getUTCMonth(); // 0-11
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return {
    from: `${y}-${pad2(m + 1)}-01`,
    to: `${y}-${pad2(m + 1)}-${pad2(lastDay)}`,
  };
}

export function resolveSalesDatePreset(
  preset: SalesDatePreset,
  todayKey: string,
): { from: string; to: string } {
  if (preset === "current_week") return currentWeekRange(todayKey);
  if (preset === "current_month") return monthRange(todayKey, 0);
  return monthRange(todayKey, 1);
}
