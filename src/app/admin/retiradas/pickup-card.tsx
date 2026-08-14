import Link from "next/link";
import { Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { SERVICE_SESSION_STATUS_TONE, STATUS_TONE_STRIP_CLASS } from "@/components/ui/status-tone";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { formatBRL } from "@/lib/money";
import { formatTime } from "@/lib/datetime";
import { ElapsedClock } from "../mesas/elapsed-clock";
import type { PickupCardData } from "./pickup-view-model";

// Card de retirada do painel do administrador — mesma densidade do
// TableCard (admin/mesas/table-card.tsx), sem "capacidade"/vaga: toda
// retirada listada aqui já é um atendimento em andamento. Módulo
// Retiradas, 2026-08-14.
export function PickupCard({ pickup }: { pickup: PickupCardData }) {
  const tone = SERVICE_SESSION_STATUS_TONE[pickup.status];
  const partiallyPaid = pickup.paidAmount > 0 && pickup.paidAmount < pickup.totalAmount;

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className={`h-1.5 w-full ${STATUS_TONE_STRIP_CLASS[tone]}`} aria-hidden />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge tone={tone}>{SERVICE_SESSION_STATUS_LABELS[pickup.status]}</StatusBadge>
          {pickup.requestedAt && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
              <Clock className="h-3 w-3" />
              retirar às {formatTime(new Date(pickup.requestedAt))}
            </span>
          )}
        </div>

        <div>
          <span className="font-display text-2xl font-semibold text-ink">
            #{pickup.pickupNumber}
          </span>
          <span className="ml-2 text-sm text-muted">{pickup.customerName}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <div>
            <div className="text-muted">Consumo</div>
            <div className="tabular font-semibold text-ink">{formatBRL(pickup.totalAmount)}</div>
          </div>
          <div>
            <div className="text-muted">Tempo aberto</div>
            <div className="font-semibold text-ink">
              <ElapsedClock since={pickup.openedAt} />
            </div>
          </div>
          <div className="col-span-2 text-muted">
            {pickup.itemCount} item(ns) · {pickup.waiterName}
          </div>
          {partiallyPaid && (
            <div className="tabular col-span-2 text-gold-dark">
              Pago {formatBRL(pickup.paidAmount)} de {formatBRL(pickup.totalAmount)}
            </div>
          )}
        </div>

        <Link
          href={`/retiradas/${pickup.id}`}
          className="mt-auto flex items-center justify-center rounded-lg border border-line py-2 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          Ver detalhes
        </Link>
      </div>
    </div>
  );
}
