import { prisma } from "@/lib/prisma";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { formatDateTime } from "@/lib/datetime";

// Histórico não depende de haver atendimento ativo — mostra atendimentos
// já encerrados desta mesa, mesmo com ela livre no momento.
export default async function HistoricoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessions = await prisma.serviceSession.findMany({
    where: { tableId: id, status: { in: ["CLOSED", "CANCELLED"] } },
    orderBy: { openedAt: "desc" },
    include: { waiter: true },
    take: 20,
  });

  return (
    <div className="flex flex-col gap-2 py-4">
      {sessions.length === 0 && (
        <p className="text-sm text-muted">Nenhum atendimento encerrado ainda.</p>
      )}
      {sessions.map((session) => (
        <div key={session.id} className="rounded-card border border-line bg-surface p-3 text-sm">
          <div className="font-medium text-ink">
            {SERVICE_SESSION_STATUS_LABELS[session.status]}
          </div>
          <div className="text-muted">
            {formatDateTime(session.openedAt)} —{" "}
            {session.closedAt ? formatDateTime(session.closedAt) : "—"} · Garçom:{" "}
            {session.waiter.name} · {session.guestCount} pessoa(s)
          </div>
        </div>
      ))}
    </div>
  );
}
