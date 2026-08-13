import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { buildSalesByPeriod } from "@/domain/reports/sales-by-period";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryField } from "@/components/ui/summary-field";
import { BarRow } from "@/components/ui/bar-row";
import { daysAgoSaoPaulo, formatDateKeyShort, saoPauloDateRange, todaySaoPaulo } from "@/lib/datetime";
import { formatBRL, toDecimal, ZERO } from "@/lib/money";
import { BarChart3 } from "lucide-react";
import { RelatoriosTabs } from "./tabs";
import { DateRangeForm } from "./date-range-form";

// Módulo 11 — "vendas por período" (pedido do usuário): faturamento por
// dia, só de atendimentos CLOSED (mesa cancelada nunca foi venda). Padrão
// "últimos 7 dias" — período curto o bastante pra abrir rápido, ajustável
// pelo filtro De/Até.
export default async function RelatorioVendasPorPeriodoPage({
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
      status: "CLOSED",
      closedAt: { gte: range.start, lt: range.end },
    },
    select: { closedAt: true, totalAmount: true },
  });

  const report = buildSalesByPeriod(
    sessions
      .filter((s): s is typeof s & { closedAt: Date } => s.closedAt !== null)
      .map((s) => ({ closedAt: s.closedAt, totalAmount: s.totalAmount })),
  );

  const maxDay = report.days.reduce((max, d) => (d.total.greaterThan(max) ? d.total : max), ZERO);
  const averagePerSession = report.sessionsCount > 0 ? toDecimal(report.total).div(report.sessionsCount) : ZERO;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" subtitle="Vendas por período" />
      <RelatoriosTabs active="periodo" />
      <DateRangeForm from={from} to={to} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryField label="Faturamento no período" value={formatBRL(report.total)} emphasis />
        <SummaryField label="Atendimentos fechados" value={String(report.sessionsCount)} />
        <SummaryField label="Ticket médio" value={formatBRL(averagePerSession)} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">Faturamento por dia</h2>
        {report.days.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nenhum atendimento fechado neste período." />
        ) : (
          <div className="flex flex-col gap-2">
            {report.days.map((day) => (
              <BarRow
                key={day.date}
                label={formatDateKeyShort(day.date)}
                title={`${formatDateKeyShort(day.date)}: ${formatBRL(day.total)} (${day.sessionsCount} atendimento(s))`}
                valueLabel={formatBRL(day.total)}
                fraction={maxDay.greaterThan(0) ? day.total.div(maxDay).toNumber() : 0}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
