import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { ROAST_RESERVATION_STATUS_LABELS } from "@/domain/roast/labels";
import { ROAST_RESERVATION_STATUS_TONE } from "@/components/ui/status-tone";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { DeliverButton } from "./deliver-button";

type ReservationWithItems = Prisma.RoastReservationGetPayload<{
  include: { items: true };
}>;

// Card da listagem (pedido do usuário 2026-10-13: trocar a linha simples
// por cards em grade com os itens visíveis e ação de entregar em um
// toque). Só o cabeçalho (nome + status) é link para o detalhe — os botões
// de ação ficam fora dele de propósito, para não aninhar <button> dentro
// de <a> (HTML inválido e o clique de um dispararia o outro).
export function ReservationCard({
  reservation,
  canEdit,
  canDeliver,
}: {
  reservation: ReservationWithItems;
  canEdit: boolean;
  canDeliver: boolean;
}) {
  const tone = ROAST_RESERVATION_STATUS_TONE[reservation.status];

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      <Link
        href={`/reservas-assados/${reservation.id}`}
        className="-m-1 flex items-start justify-between gap-2 rounded-control-sm p-1 hover:bg-ink/5"
      >
        <span className="min-w-0 truncate text-sm font-semibold text-ink">
          {reservation.customerName}
        </span>
        <StatusBadge tone={tone}>{ROAST_RESERVATION_STATUS_LABELS[reservation.status]}</StatusBadge>
      </Link>

      <ul className="flex flex-col gap-0.5">
        {reservation.items.map((item) => (
          <li key={item.id} className="truncate text-xs text-muted">
            <span className="font-semibold text-ink">
              {item.quantity.toString()}
              {"x "}
            </span>
            {item.productNameAtReservation}
          </li>
        ))}
      </ul>

      {(canEdit || canDeliver) && (
        <div className="mt-auto flex gap-2 pt-1">
          {canEdit && (
            <Button
              href={`/reservas-assados/${reservation.id}/editar`}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Editar
            </Button>
          )}
          {canDeliver && (
            <DeliverButton
              reservationId={reservation.id}
              customerName={reservation.customerName}
              triggerLabel="Entregar"
              triggerSize="sm"
              triggerClassName="flex-1"
            />
          )}
        </div>
      )}
    </Card>
  );
}
