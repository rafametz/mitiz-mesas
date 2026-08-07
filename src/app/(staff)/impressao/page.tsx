import { Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PRINT_JOB_STATUS_LABELS, PRINT_JOB_TYPE_LABELS } from "@/domain/printing/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { PRINT_JOB_STATUS_TONE } from "@/components/ui/status-tone";
import { formatDateTime } from "@/lib/datetime";
import { reprintAction, reprocessAction } from "./actions";
import { JobActionForm } from "./job-action-form";

// Fila/histórico de impressão (Módulo 7) — acessível para quem tem
// PRINT_JOBS_MANAGE (Admin, Caixa, Produção — CLAUDE.md seção 5), por isso
// fica fora de /admin (que é só pra Administrador). Mostra os últimos 50
// jobs; não é a fila "ao vivo" que o agente consome, é a visão humana de
// acompanhamento/reprocessamento.
export default async function ImpressaoPage() {
  await requirePermission(PERMISSIONS.PRINT_JOBS_MANAGE);
  const restaurant = await getCurrentRestaurant();

  const jobs = await prisma.printJob.findMany({
    where: { order: { serviceSession: { table: { restaurantId: restaurant.id } } } },
    include: {
      order: { include: { serviceSession: { include: { table: true } } } },
      sector: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader
        title="Impressão"
        subtitle="Últimos 50 tickets — ver docs/printing/architecture.md"
      />

      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <Card key={job.id} padding="sm" className="text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-ink">
                  Mesa {job.order.serviceSession.table.number}
                </span>
                <span className="text-xs text-muted">
                  Pedido #{job.order.sequenceNumber} · {job.sector.name}
                </span>
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
              {(job.status === "PRINTED" || job.status === "FAILED") && (
                <JobActionForm
                  action={reprintAction.bind(null, job.id)}
                  label="Reimprimir"
                  pendingLabel="Enviando..."
                />
              )}
            </div>
          </Card>
        ))}
        {jobs.length === 0 && (
          <EmptyState icon={Printer} title="Nenhum ticket de impressão ainda." />
        )}
      </div>
    </main>
  );
}
