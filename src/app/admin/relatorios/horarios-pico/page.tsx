import { Clock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { buildArrivalsByHour, buildRevenueByOrderHour } from "@/domain/reports/peak-hours";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryField } from "@/components/ui/summary-field";
import { BarRow } from "@/components/ui/bar-row";
import { daysAgoSaoPaulo, saoPauloDateRange, todaySaoPaulo } from "@/lib/datetime";
import { formatBRL, ZERO } from "@/lib/money";
import { RelatoriosTabs } from "../tabs";
import { DateRangeForm } from "../date-range-form";

function formatHourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}h`;
}

// Módulo 11 — "horários de pico" (pedido do usuário): duas perguntas com
// critério de horário diferente entre si (ver peak-hours.ts):
// - chegada de gente: por ABERTURA do atendimento (openedAt);
// - faturamento: por LANÇAMENTO de cada item (OrderItem.createdAt), não
//   pela mesa como um todo — revisão 2026-08-25 (relato do usuário: o
//   valor do atendimento inteiro caía no horário de abertura, escondendo
//   quando o pedido realmente saiu). Por isso conta item de mesa ainda
//   aberta hoje (sem exigir status CLOSED) e independente de pagamento —
//   só exclui item CANCELLED.
export default async function RelatorioHorariosDePicoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const from = sp.de ?? daysAgoSaoPaulo(6);
  const to = sp.ate ?? todaySaoPaulo();
  const range = saoPauloDateRange(from, to);

  const [sessions, items] = await Promise.all([
    prisma.serviceSession.findMany({
      where: {
        // `restaurantId` direto na sessão, nunca via `table:` (correção
        // 2026-08-20, relato do usuário) — retirada não tem mesa
        // (`tableId: null`), `table: { restaurantId }` excluía essas
        // sessões inteiras do relatório sem nenhum aviso.
        restaurantId: restaurant.id,
        openedAt: { gte: range.start, lt: range.end },
      },
      select: { openedAt: true, guestCount: true },
    }),
    prisma.orderItem.findMany({
      where: {
        createdAt: { gte: range.start, lt: range.end },
        order: { serviceSession: { restaurantId: restaurant.id } },
      },
      select: {
        createdAt: true,
        quantity: true,
        unitPrice: true,
        status: true,
        modifiers: { select: { priceDeltaAtOrder: true, quantity: true } },
      },
    }),
  ]);

  const arrivalsBuckets = buildArrivalsByHour(sessions);
  const revenueBuckets = buildRevenueByOrderHour(items);
  const buckets = arrivalsBuckets.map((bucket, hour) => ({
    ...bucket,
    revenue: revenueBuckets[hour]!.revenue,
  }));
  const activeArrivalBuckets = buckets.filter((b) => b.sessionsOpened > 0);
  const activeRevenueBuckets = buckets.filter((b) => b.revenue.greaterThan(0));

  const maxGuests = activeArrivalBuckets.reduce((max, b) => Math.max(max, b.guests), 0);
  const maxRevenue = activeRevenueBuckets.reduce(
    (max, b) => (b.revenue.greaterThan(max) ? b.revenue : max),
    ZERO,
  );

  const busiestByGuests = activeArrivalBuckets.reduce(
    (top, b) => (!top || b.guests > top.guests ? b : top),
    null as (typeof buckets)[number] | null,
  );
  const busiestByRevenue = activeRevenueBuckets.reduce(
    (top, b) => (!top || b.revenue.greaterThan(top.revenue) ? b : top),
    null as (typeof buckets)[number] | null,
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" subtitle="Horários de pico" />
      <RelatoriosTabs active="horarios" />
      <DateRangeForm from={from} to={to} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryField
          label="Mais gente chegando"
          value={busiestByGuests ? formatHourLabel(busiestByGuests.hour) : "Sem dados"}
          emphasis
        />
        <SummaryField
          label="Mais venda saindo"
          value={busiestByRevenue ? formatHourLabel(busiestByRevenue.hour) : "Sem dados"}
        />
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Users className="h-4 w-4 text-muted" aria-hidden="true" />
          Atendimentos abertos por horário
        </h2>
        {activeArrivalBuckets.length === 0 ? (
          <EmptyState icon={Users} title="Nenhuma mesa aberta neste período." />
        ) : (
          <div className="flex flex-col gap-2">
            {activeArrivalBuckets.map((bucket) => (
              <BarRow
                key={bucket.hour}
                label={formatHourLabel(bucket.hour)}
                title={`${formatHourLabel(bucket.hour)}: ${bucket.sessionsOpened} atendimento(s), ${bucket.guests} pessoa(s)`}
                valueLabel={`${bucket.sessionsOpened}x · ${bucket.guests} pes.`}
                fraction={maxGuests > 0 ? bucket.guests / maxGuests : 0}
                colorClass="bg-wine"
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-ink">Faturamento por horário</h2>
        <p className="mb-3 text-xs text-muted">
          Somado pelo horário em que cada pedido foi lançado, não pela abertura da mesa.
        </p>
        {activeRevenueBuckets.length === 0 ? (
          <EmptyState icon={Clock} title="Nenhum pedido lançado neste período." />
        ) : (
          <div className="flex flex-col gap-2">
            {activeRevenueBuckets.map((bucket) => (
              <BarRow
                key={bucket.hour}
                label={formatHourLabel(bucket.hour)}
                title={`${formatHourLabel(bucket.hour)}: ${formatBRL(bucket.revenue)}`}
                valueLabel={formatBRL(bucket.revenue)}
                fraction={maxRevenue.greaterThan(0) ? bucket.revenue.div(maxRevenue).toNumber() : 0}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
