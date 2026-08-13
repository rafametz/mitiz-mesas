import { Clock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { buildPeakHours } from "@/domain/reports/peak-hours";
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

// Módulo 11 — "horários de pico" (pedido do usuário): quando mais gente
// chega (por ABERTURA de atendimento) e em que horário mais sai venda.
// Filtra por openedAt, diferente dos outros 3 relatórios (que usam
// closedAt) — ver peak-hours.ts.
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

  const sessions = await prisma.serviceSession.findMany({
    where: {
      table: { restaurantId: restaurant.id },
      openedAt: { gte: range.start, lt: range.end },
    },
    select: { openedAt: true, guestCount: true, totalAmount: true },
  });

  const buckets = buildPeakHours(sessions);
  const activeBuckets = buckets.filter((b) => b.sessionsOpened > 0);

  const maxGuests = activeBuckets.reduce((max, b) => Math.max(max, b.guests), 0);
  const maxRevenue = activeBuckets.reduce(
    (max, b) => (b.revenue.greaterThan(max) ? b.revenue : max),
    ZERO,
  );

  const busiestByGuests = activeBuckets.reduce(
    (top, b) => (!top || b.guests > top.guests ? b : top),
    null as (typeof buckets)[number] | null,
  );
  const busiestByRevenue = activeBuckets.reduce(
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

      {activeBuckets.length === 0 ? (
        <Card>
          <EmptyState icon={Clock} title="Nenhuma mesa aberta neste período." />
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Users className="h-4 w-4 text-muted" aria-hidden="true" />
              Atendimentos abertos por horário
            </h2>
            <div className="flex flex-col gap-2">
              {activeBuckets.map((bucket) => (
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
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">Faturamento por horário</h2>
            <div className="flex flex-col gap-2">
              {activeBuckets.map((bucket) => (
                <BarRow
                  key={bucket.hour}
                  label={formatHourLabel(bucket.hour)}
                  title={`${formatHourLabel(bucket.hour)}: ${formatBRL(bucket.revenue)}`}
                  valueLabel={formatBRL(bucket.revenue)}
                  fraction={maxRevenue.greaterThan(0) ? bucket.revenue.div(maxRevenue).toNumber() : 0}
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
