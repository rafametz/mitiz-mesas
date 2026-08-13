import { Prisma } from "@prisma/client";
import { sumDecimals, toDecimal } from "@/lib/money";
import { TIMEZONE } from "@/lib/datetime";

// Módulo 11 (relatórios básicos) — "vendas por período": pedido do
// usuário. Puro, sem I/O: quem chama já buscou os atendimentos fechados
// no intervalo (mesmo padrão dos outros módulos de domínio).

export type SessionForPeriodReport = {
  closedAt: Date;
  totalAmount: Prisma.Decimal.Value;
};

export type DailySales = {
  // "AAAA-MM-DD" em América/Sao_Paulo, não UTC do servidor (CLAUDE.md
  // regra 23) — um atendimento fechado às 23h50 local não pode cair no
  // dia seguinte só porque o servidor está em UTC.
  date: string;
  sessionsCount: number;
  total: Prisma.Decimal;
};

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });

function dayKey(date: Date): string {
  return DAY_KEY_FORMATTER.format(date);
}

// Agrupa por dia do fechamento (não da abertura) — faturamento é
// reconhecido quando a venda se conclui; um atendimento que abre às 23h50
// e fecha 1h13 do dia seguinte soma no dia em que fechou.
export function buildSalesByPeriod(sessions: SessionForPeriodReport[]): {
  days: DailySales[];
  total: Prisma.Decimal;
  sessionsCount: number;
} {
  const byDay = new Map<string, { sessionsCount: number; total: Prisma.Decimal }>();

  for (const session of sessions) {
    const key = dayKey(session.closedAt);
    const amount = toDecimal(session.totalAmount);
    const existing = byDay.get(key);
    if (existing) {
      existing.sessionsCount += 1;
      existing.total = existing.total.add(amount);
    } else {
      byDay.set(key, { sessionsCount: 1, total: amount });
    }
  }

  const days = [...byDay.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    days,
    total: sumDecimals(days.map((d) => d.total)),
    sessionsCount: sessions.length,
  };
}
