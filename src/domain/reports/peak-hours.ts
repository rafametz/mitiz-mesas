import { Prisma, type OrderItemStatus } from "@prisma/client";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { TIMEZONE } from "@/lib/datetime";

// Módulo 11 — "horários de pico" (pedido do usuário original: "saber onde
// está vindo mais gente e qual horário está saindo mais vendas"). Duas
// perguntas diferentes, cada uma com seu próprio critério de horário —
// revisão 2026-08-25 (relato do usuário: o gráfico de faturamento jogava
// o valor do atendimento inteiro no horário em que a mesa ABRIU, então um
// chope pedido às 19h numa mesa aberta desde as 18h aparecia somado no
// horário de abertura, não no horário real do pedido — não servia pra
// "que horário a operação está mais pressionada"):
//
// - Chegada de gente (buildArrivalsByHour): por horário de ABERTURA do
//   atendimento — é sobre quando as pessoas chegam.
// - Faturamento (buildRevenueByOrderHour): por horário de LANÇAMENTO de
//   cada item — é sobre quando o pedido efetivamente sai, item por item,
//   não quando a mesa como um todo abriu ou fechou. Por isso conta mesmo
//   com a mesa ainda aberta hoje (sem depender de status CLOSED) e
//   independente de o item já estar pago — só exclui item CANCELLED
//   (mesmo critério de sales-by-product.ts).
//
// Sempre as 24 horas do dia (mesmo as com zero movimento) — quem exibe
// decide se corta o intervalo sem movimento.

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

export type SessionForArrivalsReport = {
  openedAt: Date;
  guestCount: number;
};

export type ArrivalsHourlyBucket = {
  hour: number; // 0-23, hora local em América/Sao_Paulo
  sessionsOpened: number;
  guests: number;
};

export function buildArrivalsByHour(sessions: SessionForArrivalsReport[]): ArrivalsHourlyBucket[] {
  const buckets: ArrivalsHourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessionsOpened: 0,
    guests: 0,
  }));

  for (const session of sessions) {
    const bucket = buckets[hourOf(session.openedAt)]!;
    bucket.sessionsOpened += 1;
    bucket.guests += session.guestCount;
  }

  return buckets;
}

export type ItemForHourlyRevenueReport = {
  createdAt: Date;
  quantity: number;
  unitPrice: Prisma.Decimal.Value;
  status: OrderItemStatus;
  modifiers: { priceDeltaAtOrder: Prisma.Decimal.Value; quantity: number }[];
};

export type RevenueHourlyBucket = {
  hour: number; // 0-23, hora local em América/Sao_Paulo
  revenue: Prisma.Decimal;
};

// Mesma fórmula de linha de item de sales-by-product.ts (preço unitário +
// adicionais, vezes quantidade) — só muda o agrupamento (hora do
// lançamento, não soma por produto).
export function buildRevenueByOrderHour(items: ItemForHourlyRevenueReport[]): RevenueHourlyBucket[] {
  const buckets: RevenueHourlyBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenue: ZERO,
  }));

  for (const item of items) {
    if (item.status === "CANCELLED") continue;

    const modifiersTotal = sumDecimals(
      item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
    );
    const lineTotal = toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);

    const bucket = buckets[hourOf(item.createdAt)]!;
    bucket.revenue = bucket.revenue.add(lineTotal);
  }

  return buckets;
}
