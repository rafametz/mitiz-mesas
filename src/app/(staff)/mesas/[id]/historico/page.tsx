import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";

// Histórico não depende de haver atendimento ativo — mostra atendimentos
// já encerrados desta mesa, mesmo com ela livre no momento. Cada linha
// abre o detalhe completo (itens consumidos, pessoas, pagamentos — pedido
// do usuário), não só o resumo que já cabia aqui.
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
        <Link key={session.id} href={`/mesas/${id}/historico/${session.id}`} className="block">
          <Card padding="sm" className="flex items-center justify-between gap-2 text-sm hover:border-wine/30">
            <div className="min-w-0">
              <div className="font-medium text-ink">
                {SERVICE_SESSION_STATUS_LABELS[session.status]}
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
  );
}
