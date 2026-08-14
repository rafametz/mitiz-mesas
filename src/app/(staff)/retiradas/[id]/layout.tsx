import { Clock, Phone, Wallet } from "lucide-react";
import { requireUser } from "@/application/auth/get-current-user";
import { getPickupSession } from "@/application/service-session/get-pickup-with-session";
import { hasAnyPermission, PERMISSIONS } from "@/domain/auth/permissions";
import {
  PICKUP_ORIGIN_LABELS,
  SERVICE_SESSION_STATUS_LABELS,
} from "@/domain/service-session/labels";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { SERVICE_SESSION_STATUS_TONE } from "@/components/ui/status-tone";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { pickupChannel } from "@/lib/realtime/channels";
import { formatElapsed, formatTime } from "@/lib/datetime";
import { PickupBackButton } from "./back-button";

// Mesmo racional de mesas/[id]/layout.tsx: cabeçalho fixo com identidade
// do atendimento (aqui: cliente/telefone/origem/horário em vez de
// número/pessoas da mesa) + acesso rápido ao fechamento/pagamentos.
export default async function RetiradaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const session = await getPickupSession(id);

  const canAccessClosing = hasAnyPermission(user.permissions, [
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.TABLES_CLOSE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.DISCOUNTS_APPLY,
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <RealtimeRefresh channels={[pickupChannel(id)]} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <PickupBackButton pickupId={id} />
            <h1 className="font-display text-xl font-semibold text-ink">
              Retirada #{session.pickupNumber}
            </h1>
            <StatusBadge tone={SERVICE_SESSION_STATUS_TONE[session.status]}>
              {SERVICE_SESSION_STATUS_LABELS[session.status]}
            </StatusBadge>
          </div>
          <div className="ml-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="text-ink">{session.customerName}</span>
            {session.customerPhone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {session.customerPhone}
              </span>
            )}
            {session.pickupOrigin && <span>{PICKUP_ORIGIN_LABELS[session.pickupOrigin]}</span>}
            {session.requestedAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Retirar às {formatTime(session.requestedAt)}
              </span>
            )}
            <span>há {formatElapsed(session.openedAt)} · {session.waiter.name}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canAccessClosing && (
            <IconButton
              href={`/retiradas/${id}/pagamentos`}
              label="Fechamento e pagamentos"
              icon={Wallet}
            />
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
