import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { formatTableLabel } from "@/domain/table/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBRL } from "@/lib/money";
import { formatDateTime, saoPauloDayRange } from "@/lib/datetime";
import { HistoricoTabs } from "./tabs";

// Consulta geral de atendimentos encerrados de todas as mesas (Módulo 10,
// pedido do usuário) — diferente da aba "Histórico" da tela da mesa
// (só daquela mesa), esta é a visão pra quem precisa achar um atendimento
// sem já saber de qual mesa era. Mesma permissão de auditoria/relatório
// (CLAUDE.md seção 5 — Admin e Caixa "visualizam relatórios e
// auditoria"), por isso fica fora de /admin (Garçom/Produção não têm
// AUDIT_VIEW e não deveriam ver o financeiro de mesas que não são delas).
export default async function HistoricoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; garcomId?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;

  const waiters = await prisma.user.findMany({
    where: { restaurantId: restaurant.id, active: true, role: { name: { in: ["WAITER", "ADMIN"] } } },
    orderBy: { name: "asc" },
  });

  const dateRange = sp.data ? saoPauloDayRange(sp.data) : null;

  const sessions = await prisma.serviceSession.findMany({
    where: {
      table: { restaurantId: restaurant.id },
      status: { in: ["CLOSED", "CANCELLED"] },
      ...(sp.garcomId ? { waiterId: sp.garcomId } : {}),
      ...(dateRange ? { openedAt: { gte: dateRange.start, lt: dateRange.end } } : {}),
    },
    include: { table: true, waiter: true },
    orderBy: { openedAt: "desc" },
    take: 100,
  });

  const hasFilter = Boolean(sp.data || sp.garcomId);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader
        title="Histórico"
        subtitle="Atendimentos encerrados de todas as mesas. Últimos 100."
      />
      <HistoricoTabs active="atendimentos" />

      <Card padding="sm">
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Data</span>
            <input
              type="date"
              name="data"
              defaultValue={sp.data ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Garçom</span>
            <select
              name="garcomId"
              defaultValue={sp.garcomId ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            >
              <option value="">Todos</option>
              {waiters.map((waiter) => (
                <option key={waiter.id} value={waiter.id}>
                  {waiter.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-10 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            Filtrar
          </button>
          {hasFilter && (
            <Link
              href="/historico"
              className="flex h-10 items-center px-2 text-sm font-medium text-muted hover:text-ink"
            >
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        {sessions.length === 0 && (
          <EmptyState
            icon={History}
            title={
              hasFilter
                ? "Nenhum atendimento encontrado com esse filtro."
                : "Nenhum atendimento encerrado ainda."
            }
          />
        )}
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/mesas/${session.tableId}/historico/${session.id}`}
            className="block"
          >
            <Card
              padding="sm"
              className="flex items-center justify-between gap-2 text-sm hover:border-wine/30"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {formatTableLabel(session.table.number)}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {SERVICE_SESSION_STATUS_LABELS[session.status]}
                  </span>
                  <span className="ml-2 tabular text-xs font-normal text-muted">
                    {formatBRL(session.totalAmount)}
                  </span>
                </div>
                <div className="truncate text-muted">
                  {formatDateTime(session.openedAt)} até{" "}
                  {session.closedAt ? formatDateTime(session.closedAt) : "-"} · Garçom:{" "}
                  {session.waiter.name} · {session.guestCount} pessoa(s)
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
