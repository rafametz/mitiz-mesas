import Link from "next/link";
import { Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PRINT_JOB_STATUS_LABELS, PRINT_JOB_TYPE_LABELS } from "@/domain/printing/labels";
import { getAgentStatus, formatElapsedSince } from "@/domain/printing/agent-status";
import { formatTableLabel } from "@/domain/table/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { AGENT_STATUS_TONE, PRINT_JOB_STATUS_TONE } from "@/components/ui/status-tone";
import { formatDateTime, saoPauloDayRange, todaySaoPaulo } from "@/lib/datetime";
import { reprintAction, reprocessAction } from "./actions";
import { JobActionForm } from "./job-action-form";

const AGENT_STATUS_LABEL = {
  online: "Agente ativo",
  offline: "Agente sem contato",
  never_connected: "Agente nunca conectou",
} as const;

// Fila/histórico de impressão (Módulo 7) — acessível para quem tem
// PRINT_JOBS_MANAGE (Admin, Caixa, Produção — CLAUDE.md seção 5), por isso
// fica fora de /admin (que é só pra Administrador). Não é a fila "ao vivo"
// que o agente consome, é a visão humana de acompanhamento/reprocessamento.
// Sempre filtrada por data (padrão: hoje, pedido do usuário) — sem isso a
// lista cresce indefinidamente e fica difícil achar o ticket de agora.
export default async function ImpressaoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; mesa?: string }>;
}) {
  await requirePermission(PERMISSIONS.PRINT_JOBS_MANAGE);
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const selectedDate = sp.data ?? todaySaoPaulo();
  const dateRange = saoPauloDayRange(selectedDate);

  const [printers, tables] = await Promise.all([
    prisma.printer.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.table.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { number: "asc" },
    }),
  ]);

  // BILL_SUMMARY não tem `order` (orderId nulo) — filtra pelo restaurante
  // (e, se escolhida, pela mesa) por qualquer um dos dois vínculos
  // possíveis (order ou serviceSession direto), senão esses jobs somem da
  // lista inteiros.
  const jobs = await prisma.printJob.findMany({
    where: {
      AND: [
        {
          OR: [
            { order: { serviceSession: { table: { restaurantId: restaurant.id } } } },
            { serviceSession: { table: { restaurantId: restaurant.id } } },
          ],
        },
        { createdAt: { gte: dateRange.start, lt: dateRange.end } },
        sp.mesa
          ? {
              OR: [
                { order: { serviceSession: { tableId: sp.mesa } } },
                { serviceSession: { tableId: sp.mesa } },
              ],
            }
          : {},
      ],
    },
    include: {
      order: { include: { serviceSession: { include: { table: true } } } },
      serviceSession: { include: { table: true } },
      sector: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader title="Impressão" subtitle="Até 100 tickets do dia filtrado." />

      <Card padding="sm">
        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Data</span>
            <input
              type="date"
              name="data"
              defaultValue={selectedDate}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
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
          <button
            type="submit"
            className="h-10 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            Filtrar
          </button>
          {sp.mesa && (
            <Link
              href={`/impressao?data=${selectedDate}`}
              className="flex h-10 items-center px-2 text-sm font-medium text-muted hover:text-ink"
            >
              Limpar mesa
            </Link>
          )}
        </form>
      </Card>

      <div className="flex flex-col gap-2">
        {printers.map((printer) => {
          const status = getAgentStatus(printer.lastSeenAt);
          return (
            <Card key={printer.id} padding="sm" className="flex items-center justify-between text-sm">
              <div>
                <span className="font-display font-semibold text-ink">{printer.name}</span>
                <span className="ml-2 text-xs text-muted">
                  {printer.lastSeenAt
                    ? `última consulta ${formatElapsedSince(printer.lastSeenAt)}`
                    : "sem nenhum contato registrado"}
                </span>
              </div>
              <StatusBadge tone={AGENT_STATUS_TONE[status]}>{AGENT_STATUS_LABEL[status]}</StatusBadge>
            </Card>
          );
        })}
        {printers.length === 0 && (
          <p className="text-sm text-muted">Nenhuma impressora ativa cadastrada.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {jobs.map((job) => {
          // BILL_SUMMARY não tem order/sector (não é sobre um pedido
          // específico) — resolve a mesa pelo vínculo que existir.
          const table = job.order?.serviceSession.table ?? job.serviceSession?.table ?? null;

          return (
            <Card key={job.id} padding="sm" className="text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-ink">
                    {table ? formatTableLabel(table.number) : "Mesa não identificada"}
                  </span>
                  {job.order && (
                    <span className="text-xs text-muted">
                      Pedido #{job.order.sequenceNumber}
                      {job.sector && ` · ${job.sector.name}`}
                    </span>
                  )}
                </div>
                <StatusBadge tone={PRINT_JOB_STATUS_TONE[job.status]}>
                  {PRINT_JOB_STATUS_LABELS[job.status]}
                </StatusBadge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>{PRINT_JOB_TYPE_LABELS[job.type]}</span>
                <span>{formatDateTime(job.createdAt)}</span>
                {job.attempts > 0 && <span>{job.attempts} tentativa(s)</span>}
              </div>

              {job.lastError && (
                <p className="mt-1 rounded bg-wine/5 px-2 py-1 text-xs text-wine">{job.lastError}</p>
              )}

              <div className="mt-2 flex gap-2">
                {job.status === "FAILED" && (
                  <JobActionForm
                    action={reprocessAction.bind(null, job.id)}
                    label="Reprocessar"
                    pendingLabel="Reprocessando..."
                  />
                )}
                {/* Resumo da comanda reflete o saldo do momento em que foi
                    gerado — reimprimir o conteúdo antigo não faz sentido
                    (createReprintJob rejeita); pedir um resumo novo pela
                    tela da mesa é o caminho certo. */}
                {job.type !== "BILL_SUMMARY" &&
                  (job.status === "PRINTED" || job.status === "FAILED") && (
                    <JobActionForm
                      action={reprintAction.bind(null, job.id)}
                      label="Reimprimir"
                      pendingLabel="Enviando..."
                    />
                  )}
              </div>
            </Card>
          );
        })}
        {jobs.length === 0 && (
          <EmptyState
            icon={Printer}
            title={
              selectedDate === todaySaoPaulo() ? "Nenhum ticket hoje ainda." : "Nenhum ticket neste dia."
            }
          />
        )}
      </div>
    </main>
  );
}
