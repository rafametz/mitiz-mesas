import Link from "next/link";
import { ChevronLeft, ChevronRight, Drumstick, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { availableQuantity, isValidDateKey, nextSundayFrom } from "@/domain/roast/production";
import { ROAST_RESERVATION_STATUS_LABELS } from "@/domain/roast/labels";
import { ROAST_RESERVATION_STATUS_TONE } from "@/components/ui/status-tone";
import { PageHeader, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Fab } from "@/components/ui/fab";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { roastProductionDayChannel, restaurantRoastReservationsChannel } from "@/lib/realtime/channels";
import { formatDateKeyWeekday, shiftDateKey, todaySaoPaulo } from "@/lib/datetime";

export default async function ReservasAssadosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataParam } = await searchParams;
  // Reserva de assado só acontece aos domingos (pedido do usuário
  // 2026-10-04) — ao abrir a tela sem data escolhida, mostra o próximo
  // domingo a partir de hoje (hoje mesmo, se hoje já for domingo); os
  // botões de navegação abaixo pulam de domingo em domingo, nunca
  // dia a dia.
  const date = nextSundayFrom(dataParam && isValidDateKey(dataParam) ? dataParam : todaySaoPaulo());

  const user = await requirePermission(PERMISSIONS.ROASTS_VIEW);
  const restaurant = await getCurrentRestaurant();
  const canCreate = hasPermission(user.permissions, PERMISSIONS.ROASTS_CREATE);

  const productionDay = await prisma.roastProductionDay.findUnique({
    where: { restaurantId_date: { restaurantId: restaurant.id, date } },
    include: {
      productions: {
        include: { roastProduct: true },
        orderBy: { roastProduct: { sortOrder: "asc" } },
      },
      reservations: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6 pb-24">
      {productionDay && (
        <RealtimeRefresh
          channels={[
            roastProductionDayChannel(productionDay.id),
            restaurantRoastReservationsChannel(restaurant.id),
          ]}
        />
      )}

      <PageHeader title="Reservas de Assados" subtitle="Disponibilidade e reservas por dia" />

      <Card padding="sm" className="flex items-center justify-between gap-2">
        <Link
          href={`/reservas-assados?data=${shiftDateKey(date, -7)}`}
          className="flex h-10 w-10 items-center justify-center rounded-control-sm text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Domingo anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-sm font-semibold capitalize text-ink">{formatDateKeyWeekday(date)}</span>
        <Link
          href={`/reservas-assados?data=${shiftDateKey(date, 7)}`}
          className="flex h-10 w-10 items-center justify-center rounded-control-sm text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Próximo domingo"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </Card>

      {!productionDay ? (
        <EmptyState
          icon={Drumstick}
          title="Nenhuma produção configurada para este dia. Peça ao administrador para configurar em Administração."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold text-ink">Disponibilidade</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {productionDay.productions.map((production) => {
                const available = availableQuantity(
                  production.plannedQuantity,
                  production.reservedQuantity,
                );
                const sold = available.lessThanOrEqualTo(0);
                return (
                  <Card key={production.id} padding="sm" className="flex items-center justify-between">
                    <span className="text-sm text-ink">{production.roastProduct.name}</span>
                    <span
                      className={`tabular text-sm font-semibold ${sold ? "text-muted" : "text-ink"}`}
                    >
                      {sold ? "Esgotado" : `${available.toString()} ${production.roastProduct.unit}`}
                    </span>
                  </Card>
                );
              })}
              {productionDay.productions.length === 0 && (
                <EmptyState
                  className="col-span-full"
                  title="Nenhum produto com quantidade planejada para este dia ainda."
                />
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-base font-semibold text-ink">
              Reservas ({productionDay.reservations.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {productionDay.reservations.map((reservation) => {
                const tone = ROAST_RESERVATION_STATUS_TONE[reservation.status];
                return (
                  <li key={reservation.id}>
                    <Link href={`/reservas-assados/${reservation.id}`}>
                      <Card padding="sm" className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">
                            {reservation.customerName}
                          </div>
                          <div className="truncate text-xs text-muted">
                            {reservation.items.length} item(ns)
                          </div>
                        </div>
                        <StatusBadge tone={tone}>
                          {ROAST_RESERVATION_STATUS_LABELS[reservation.status]}
                        </StatusBadge>
                      </Card>
                    </Link>
                  </li>
                );
              })}
              {productionDay.reservations.length === 0 && (
                <EmptyState title="Nenhuma reserva para este dia ainda." />
              )}
            </ul>
          </div>

          {canCreate && (
            <Fab href={`/reservas-assados/nova?data=${date}`} icon={Plus}>
              Nova reserva
            </Fab>
          )}
        </>
      )}
    </main>
  );
}
