import Link from "next/link";
import { Clock, ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { ACTIVE_SERVICE_SESSION_STATUSES } from "@/domain/service-session/states";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SERVICE_SESSION_STATUS_TONE, STATUS_TONE_STRIP_CLASS } from "@/components/ui/status-tone";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { restaurantPickupsChannel } from "@/lib/realtime/channels";
import { formatTime } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { AtendimentoTabs } from "../atendimento-tabs";

// Visão de retiradas (CLAUDE.md — módulo Retiradas, 2026-08-14): grid do
// mesmo formato do grid de mesas, mas sem faixa de ocupação — todo cartão
// aqui já é um atendimento em andamento, não existe "retirada livre" pra
// abrir. Só as ativas (OPEN/CLOSING); encerradas ficam no Histórico.
export default async function RetiradasPage() {
  const user = await requireUser();
  const restaurant = await getCurrentRestaurant();
  const canCreate = hasPermission(user.permissions, PERMISSIONS.TABLES_OPEN);

  const pickups = await prisma.serviceSession.findMany({
    where: {
      restaurantId: restaurant.id,
      type: "PICKUP",
      status: { in: [...ACTIVE_SERVICE_SESSION_STATUSES] },
    },
    include: {
      waiter: true,
      orders: { include: { items: { where: { status: { not: "CANCELLED" } } } } },
    },
    orderBy: { pickupNumber: "asc" },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6">
      <RealtimeRefresh channels={[restaurantPickupsChannel(restaurant.id)]} />
      <AtendimentoTabs active="retiradas" />
      <PageHeader
        title="Retiradas"
        subtitle={`${pickups.length} em andamento`}
        action={canCreate ? <Button href="/retiradas/nova">+ Nova retirada</Button> : undefined}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {pickups.map((session) => {
          const itemCount = session.orders.reduce((n, o) => n + o.items.length, 0);
          const tone = SERVICE_SESSION_STATUS_TONE[session.status];
          const partiallyPaid =
            session.paidAmount.greaterThan(0) && session.paidAmount.lessThan(session.totalAmount);

          return (
            <Link
              key={session.id}
              href={`/retiradas/${session.id}`}
              className="group relative flex flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-wine/40"
            >
              <div className={`h-1.5 w-full ${STATUS_TONE_STRIP_CLASS[tone]}`} aria-hidden />
              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-lg font-semibold text-ink">
                    Retirada #{session.pickupNumber}
                  </span>
                  <StatusBadge tone={tone}>{SERVICE_SESSION_STATUS_LABELS[session.status]}</StatusBadge>
                </div>

                <span className="truncate text-sm text-ink">{session.customerName}</span>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  {session.requestedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {formatTime(session.requestedAt)}
                    </span>
                  )}
                  <span>
                    {itemCount} item(ns) · {session.waiter.name}
                  </span>
                </div>

                <div className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-2">
                  <span className="text-[11px] text-muted">Toque para abrir</span>
                  <span className="tabular shrink-0 font-display text-sm font-semibold text-ink">
                    {formatBRL(session.totalAmount)}
                  </span>
                </div>
                {partiallyPaid && (
                  <span className="tabular text-[11px] font-medium text-gold-dark">
                    Pago {formatBRL(session.paidAmount)} de {formatBRL(session.totalAmount)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
        {pickups.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title="Nenhuma retirada em andamento."
            className="col-span-full"
            action={canCreate ? <Button href="/retiradas/nova">Criar nova retirada</Button> : undefined}
          />
        )}
      </div>
    </main>
  );
}
