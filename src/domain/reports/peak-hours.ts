import { Prisma } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";
import { TIMEZONE } from "@/lib/datetime";

// Módulo 11 — "horários de pico": pedido do usuário ("saber onde está
// vindo mais gente e qual horário está saindo mais vendas"). Agrupa por
// hora da ABERTURA do atendimento (não do fechamento, diferente de
// sales-by-period.ts) — é sobre quando as pessoas chegam, não quando a
// venda se conclui. Sempre as 24 horas do dia (mesmo as com zero
// atendimento) — quem exibe decide se corta o intervalo sem movimento.

export type SessionForPeakHoursReport = {
  openedAt: Date;
  guestCount: number;
  totalAmount: Prisma.Decimal.Value;
};

export type HourlyBucket = {
  hour: number; // 0-23, hora local em América/Sao_Paulo
  sessionsOpened: number;
  guests: number;
  revenue: Prisma.Decimal;
};

const HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour: "numeric",
  hour12: false,
});

// %24 de propósito: algumas versões do ICU devolvem "24" pra meia-noite
// com hour12:false em vez de "0" — normaliza pro índice de array certo.
function hourOf(date: Date): number {
  const part = HOUR_FORMATTER.formatToParts(date).find((p) => p.type === "hour");
  return part ? Number(part.value) % 24 : 0;
}

export function buildPeakHours(sessions: SessionForPeakHoursReport[]): HourlyBucket[] {
  const buckets: HourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessionsOpened: 0,
    guests: 0,
    revenue: ZERO,
  }));

  for (const session of sessions) {
    const bucket = buckets[hourOf(session.openedAt)]!;
    bucket.sessionsOpened += 1;
    bucket.guests += session.guestCount;
    bucket.revenue = bucket.revenue.add(toDecimal(session.totalAmount));
  }

  return buckets;
}
