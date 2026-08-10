import { ArrowLeft, Clock, History, Users, Wallet } from "lucide-react";
import { requireUser } from "@/application/auth/get-current-user";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasAnyPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { TABLE_STATUS_LABELS } from "@/domain/table/labels";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SERVICE_SESSION_STATUS_TONE, TABLE_STATUS_TONE } from "@/components/ui/status-tone";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { tableChannel } from "@/lib/realtime/channels";
import { formatElapsed, formatTime } from "@/lib/datetime";

export default async function MesaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { table, session } = await getTableWithActiveSession(id);

  // Ícone de acesso ao fechamento (Módulo 8) fica sempre visível quando há
  // atendimento ativo e o perfil tem alguma permissão relacionada — mesmo
  // racional do ícone de Histórico ao lado: ação disponível pelo cabeçalho
  // em qualquer aba, sem disputar espaço com o FAB "Novo pedido".
  const canAccessClosing =
    session !== null &&
    hasAnyPermission(user.permissions, [
      PERMISSIONS.TABLES_CLOSE_REQUEST,
      PERMISSIONS.TABLES_CLOSE,
      PERMISSIONS.PAYMENTS_REGISTER,
      PERMISSIONS.DISCOUNTS_APPLY,
    ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <RealtimeRefresh channels={[tableChannel(id)]} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <IconButton
              href="/mesas"
              label="Voltar para mesas"
              icon={ArrowLeft}
              className="-ml-2"
            />
            <h1 className="font-display text-xl font-semibold text-ink">Mesa {table.number}</h1>
            <StatusBadge
              tone={
                session
                  ? SERVICE_SESSION_STATUS_TONE[session.status]
                  : TABLE_STATUS_TONE[table.status]
              }
            >
              {session
                ? SERVICE_SESSION_STATUS_LABELS[session.status]
                : TABLE_STATUS_LABELS[table.status]}
            </StatusBadge>
          </div>
          {session && (
            <div className="ml-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(session.openedAt)} · há {formatElapsed(session.openedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {session.guestCount} pessoa(s) · {session.waiter.name}
              </span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canAccessClosing && (
            <IconButton
              href={`/mesas/${id}/pagamentos`}
              label="Fechamento e pagamentos"
              icon={Wallet}
            />
          )}
          {/* Histórico é a informação menos usada durante o atendimento ativo
              (é sobre atendimentos já encerrados) — fica um ícone discreto no
              cabeçalho, não uma aba do mesmo peso que Pedidos/Comanda
              (refatoração mobile-first da tela da mesa). */}
          <IconButton href={`/mesas/${id}/historico`} label="Histórico da mesa" icon={History} />
        </div>
      </div>

      {children}
    </div>
  );
}
