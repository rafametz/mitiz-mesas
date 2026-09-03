import { Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { buildTableOpenDuration } from "@/domain/reports/table-open-duration";
import { formatTableLabel } from "@/domain/table/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryField } from "@/components/ui/summary-field";
import { formatDateTime, saoPauloDateRange } from "@/lib/datetime";
import { RelatoriosTabs } from "../tabs";
import { DateRangeForm } from "../date-range-form";
import { resolveReportDateRange } from "../date-range";

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h${remaining.toString().padStart(2, "0")}`;
}

// Módulo 11 — "tempo de mesas abertas": pedido do usuário. Cada
// atendimento fechado no período, do mais demorado pro mais rápido —
// ajuda a achar mesa "esquecida" aberta demais.
export default async function RelatorioTempoDeMesasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const { from, to, invalid } = resolveReportDateRange(sp);
  const range = saoPauloDateRange(from, to);

  // Relatório é especificamente sobre mesa física — retirada (módulo
  // Retiradas, 2026-08-14) não tem "tempo aberto" com o mesmo significado
  // operacional (não ocupa espaço físico), então fica fora deste relatório
  // por escolha, não por esquecimento. type: "TABLE" torna isso explícito
  // (antes disso já acontecia de forma implícita via `table: {...}`).
  const sessions = invalid
    ? []
    : await prisma.serviceSession.findMany({
        where: {
          restaurantId: restaurant.id,
          type: "TABLE",
          status: "CLOSED",
          closedAt: { gte: range.start, lt: range.end },
        },
        include: { table: true, waiter: true },
        orderBy: { closedAt: "desc" },
      });

  const report = buildTableOpenDuration(
    sessions
      .filter(
        (s): s is typeof s & { closedAt: Date; table: NonNullable<typeof s.table> } =>
          s.closedAt !== null && s.table !== null,
      )
      .map((s) => ({
        id: s.id,
        tableNumber: s.table.number,
        waiterName: s.waiter.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
      })),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" subtitle="Tempo de mesas abertas" />
      <RelatoriosTabs active="mesas" />
      <DateRangeForm
        from={from}
        to={to}
        error={invalid ? "A data \"De\" não pode ser depois da data \"Até\". Ajuste e filtre de novo." : undefined}
      />

      {!invalid && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <SummaryField label="Atendimentos fechados" value={String(report.lines.length)} />
            <SummaryField label="Duração média" value={formatDuration(report.averageMinutes)} emphasis />
            {report.lines[0] && (
              <SummaryField label="Mais demorado" value={formatDuration(report.lines[0].durationMinutes)} />
            )}
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              Atendimentos, do mais demorado pro mais rápido
            </h2>
            {report.lines.length === 0 ? (
              <EmptyState icon={Timer} title="Nenhum atendimento fechado neste período." />
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {report.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-2 border-b border-line/60 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <div className="text-ink">
                        {formatTableLabel(line.tableNumber)} · {line.waiterName}
                      </div>
                      <div className="text-xs text-muted">
                        {formatDateTime(line.openedAt)} até {formatDateTime(line.closedAt)}
                      </div>
                    </div>
                    <span className="tabular shrink-0 font-display text-sm font-semibold text-ink">
                      {formatDuration(line.durationMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
