import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { AUDIT_ACTION_LABELS, auditActionLabel } from "@/domain/audit/labels";
import { formatAuditMetadataEntries } from "@/domain/audit/metadata";
import { formatTableLabel } from "@/domain/table/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime, saoPauloDayRange } from "@/lib/datetime";
import { HistoricoTabs } from "../tabs";

// Módulo 9 (consolidação) — trilha de auditoria já é gravada em toda ação
// crítica desde os módulos anteriores (cancelamento, desconto, taxa,
// fechamento, pagamento, pessoa quitada — CLAUDE.md regra 22); esta tela
// só deixa isso consultável, com os 4 filtros pedidos (usuário, mesa, tipo
// de ação, data). Mesma permissão/posicionamento de /historico (AUDIT_VIEW,
// fora de /admin — Admin e Caixa, business-rules.md §7 "ver auditoria:
// Admin sim, Caixa parcial").
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ usuarioId?: string; mesa?: string; acao?: string; data?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;

  const [users, tables] = await Promise.all([
    prisma.user.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.table.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { number: "asc" },
    }),
  ]);

  const dateRange = sp.data ? saoPauloDayRange(sp.data) : null;

  const logs = await prisma.auditLog.findMany({
    where: {
      restaurantId: restaurant.id,
      ...(sp.usuarioId ? { userId: sp.usuarioId } : {}),
      ...(sp.mesa ? { tableId: sp.mesa } : {}),
      ...(sp.acao ? { action: sp.acao } : {}),
      ...(dateRange ? { createdAt: { gte: dateRange.start, lt: dateRange.end } } : {}),
    },
    include: { user: true, table: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const hasFilter = Boolean(sp.usuarioId || sp.mesa || sp.acao || sp.data);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader title="Histórico" subtitle="Trilha de auditoria de ações críticas. Últimos 200." />
      <HistoricoTabs active="auditoria" />

      <Card padding="sm">
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Usuário</span>
            <select
              name="usuarioId"
              defaultValue={sp.usuarioId ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            >
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Mesa</span>
            <select
              name="mesa"
              defaultValue={sp.mesa ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            >
              <option value="">Todas</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {formatTableLabel(table.number)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Tipo de ação</span>
            <select
              name="acao"
              defaultValue={sp.acao ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            >
              <option value="">Todos</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([action, label]) => (
                <option key={action} value={action}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Data</span>
            <input
              type="date"
              name="data"
              defaultValue={sp.data ?? ""}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            Filtrar
          </button>
          {hasFilter && (
            <Link
              href="/historico/auditoria"
              className="flex h-10 items-center px-2 text-sm font-medium text-muted hover:text-ink"
            >
              Limpar
            </Link>
          )}
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        {logs.length === 0 && (
          <EmptyState
            icon={ShieldAlert}
            title={
              hasFilter
                ? "Nenhum registro encontrado com esse filtro."
                : "Nenhuma ação auditada ainda."
            }
          />
        )}
        {logs.map((log) => {
          const metadataEntries = formatAuditMetadataEntries(log.metadata);
          return (
            <Card key={log.id} padding="sm" className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-ink">{auditActionLabel(log.action)}</span>
                <span className="text-xs text-muted">{formatDateTime(log.createdAt)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>{log.user?.name ?? "Sistema"}</span>
                {log.table && (
                  <Link href={`/mesas/${log.table.id}`} className="text-wine hover:underline">
                    {formatTableLabel(log.table.number)}
                  </Link>
                )}
              </div>
              {metadataEntries.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 text-xs sm:grid-cols-3">
                  {metadataEntries.map((entry) => (
                    <div key={entry.label}>
                      <dt className="text-muted">{entry.label}</dt>
                      <dd className="truncate text-ink">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}
