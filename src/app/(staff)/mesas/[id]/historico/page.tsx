import { History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
        <EmptyState icon={History} title="Nenhum atendimento encerrado ainda." />
      )}
      {sessions.map((session) => (
        <Card key={session.id} padding="sm" className="text-sm">
          <div className="font-medium text-ink">
            {SERVICE_SESSION_STATUS_LABELS[session.status]}
          </div>
          <div className="text-muted">
            {formatDateTime(session.openedAt)} até{" "}
            {session.closedAt ? formatDateTime(session.closedAt) : "-"} · Garçom:{" "}
            {session.waiter.name} · {session.guestCount} pessoa(s)
          </div>
        </Card>
      ))}
    </div>
  );
}
