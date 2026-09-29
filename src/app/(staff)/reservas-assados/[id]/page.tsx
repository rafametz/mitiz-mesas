import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { isRoastReservationEditable } from "@/domain/roast/states";
import { ROAST_RESERVATION_STATUS_LABELS } from "@/domain/roast/labels";
import { ROAST_RESERVATION_STATUS_TONE } from "@/components/ui/status-tone";
import { Card, PageHeader } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ReasonConfirmForm } from "@/components/form/reason-confirm-form";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { roastProductionDayChannel } from "@/lib/realtime/channels";
import { formatDateTime } from "@/lib/datetime";
import { cancelReservationAction } from "../actions";
import { DeliverButton } from "./deliver-button";

export default async function ReservaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.ROASTS_VIEW);

  const reservation = await prisma.roastReservation.findUnique({
    where: { id },
    include: {
      productionDay: true,
      waiter: true,
      deliveredBy: true,
      cancelledBy: true,
      items: true,
    },
  });
  if (!reservation) notFound();

  const canEdit =
    hasPermission(user.permissions, PERMISSIONS.ROASTS_EDIT) &&
    isRoastReservationEditable(reservation.status);
  const canCancel =
    hasPermission(user.permissions, PERMISSIONS.ROASTS_CANCEL) &&
    isRoastReservationEditable(reservation.status);
  const canDeliver =
    hasPermission(user.permissions, PERMISSIONS.ROASTS_DELIVER) &&
    isRoastReservationEditable(reservation.status);

  const tone = ROAST_RESERVATION_STATUS_TONE[reservation.status];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6 pb-24">
      <RealtimeRefresh channels={[roastProductionDayChannel(reservation.productionDayId)]} />

      <div className="flex items-center gap-2">
        <IconButton href="/reservas-assados" label="Voltar para reservas" icon={ArrowLeft} className="-ml-2" />
        <PageHeader
          title={reservation.customerName}
          subtitle={reservation.productionDay.date.split("-").reverse().join("/")}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Status</span>
          <StatusBadge tone={tone}>{ROAST_RESERVATION_STATUS_LABELS[reservation.status]}</StatusBadge>
        </div>
        {reservation.customerPhone && (
          <div className="text-sm text-muted">Telefone: {reservation.customerPhone}</div>
        )}
        <div className="text-sm text-muted">
          Reservado por {reservation.waiter.name} em {formatDateTime(reservation.createdAt)}
        </div>
        {reservation.notes && (
          <div className="text-sm text-ink">Observação: {reservation.notes}</div>
        )}
        {reservation.status === "DELIVERED" && reservation.deliveredAt && (
          <div className="text-sm text-muted">
            Entregue por {reservation.deliveredBy?.name ?? "?"} em{" "}
            {formatDateTime(reservation.deliveredAt)}
          </div>
        )}
        {reservation.status === "CANCELLED" && reservation.cancelledAt && (
          <div className="text-sm text-muted">
            Cancelado por {reservation.cancelledBy?.name ?? "?"} em{" "}
            {formatDateTime(reservation.cancelledAt)}
            {reservation.cancelReason && ` · Motivo: ${reservation.cancelReason}`}
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-base font-semibold text-ink">Itens</h2>
        <ul className="flex flex-col gap-2">
          {reservation.items.map((item) => (
            <li key={item.id}>
              <Card padding="sm" className="flex items-center justify-between">
                <span className="text-sm text-ink">{item.productNameAtReservation}</span>
                <span className="tabular text-sm font-semibold text-ink">
                  {item.quantity.toString()} {item.unitAtReservation}
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {(canEdit || canCancel || canDeliver) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {canEdit && <Button href={`/reservas-assados/${reservation.id}/editar`}>Editar</Button>}
          {canDeliver && (
            <DeliverButton reservationId={reservation.id} customerName={reservation.customerName} />
          )}
          {canCancel && (
            <ReasonConfirmForm
              action={cancelReservationAction.bind(null, reservation.id)}
              triggerLabel="Cancelar reserva"
              dialogTitle="Cancelar reserva"
              itemLabel={`Reserva de ${reservation.customerName}`}
              pendingLabel="Cancelando..."
              successMessage="Reserva cancelada."
              triggerClassName="inline-flex h-11 items-center justify-center rounded-control-sm border border-wine/40 px-4 text-sm font-semibold text-wine hover:bg-wine/5"
            />
          )}
        </div>
      )}
    </main>
  );
}
