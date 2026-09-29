import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { isValidDateKey, nextSundayFrom } from "@/domain/roast/production";
import { ROAST_RESERVATION_STATUS_LABELS } from "@/domain/roast/labels";
import { ROAST_RESERVATION_STATUS_TONE } from "@/components/ui/status-tone";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateKeyWeekday, shiftDateKey, todaySaoPaulo } from "@/lib/datetime";
import { ProductionDayForm } from "./production-day-form";

// Só domingo (pedido do usuário 2026-10-04) — a MITIZ só faz reserva de
// assado aos domingos, então a tela de produção navega de domingo em
// domingo, igual à tela de reservas do garçom (nunca um calendário livre
// nem navegação dia a dia), evitando configurar produção pra um dia que
// nunca vai virar reserva de verdade.
export default async function ProducaoAssadosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataParam } = await searchParams;
  const date = nextSundayFrom(dataParam && isValidDateKey(dataParam) ? dataParam : todaySaoPaulo());

  const restaurant = await getCurrentRestaurant();

  const [day, products] = await Promise.all([
    prisma.roastProductionDay.findUnique({
      where: { restaurantId_date: { restaurantId: restaurant.id, date } },
      include: {
        productions: true,
        reservations: {
          where: { status: { not: "CANCELLED" } },
          include: { items: true, waiter: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.roastProduct.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const productionByProductId = new Map((day?.productions ?? []).map((p) => [p.roastProductId, p]));
  const reservations = day?.reservations ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Produção por dia"
        subtitle="Quantidade planejada de cada produto assado, para o domingo escolhido."
      />
      <Link
        href="/admin/reservas-assados"
        className="text-sm font-medium text-wine underline underline-offset-2"
      >
        ← Catálogo de produtos
      </Link>

      <Card padding="sm" className="flex max-w-sm items-center justify-between gap-2">
        <Link
          href={`/admin/reservas-assados/producao?data=${shiftDateKey(date, -7)}`}
          className="flex h-10 w-10 items-center justify-center rounded-control-sm text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Domingo anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-sm font-semibold capitalize text-ink">{formatDateKeyWeekday(date)}</span>
        <Link
          href={`/admin/reservas-assados/producao?data=${shiftDateKey(date, 7)}`}
          className="flex h-10 w-10 items-center justify-center rounded-control-sm text-muted hover:bg-ink/5 hover:text-ink"
          aria-label="Próximo domingo"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </Card>

      {products.length === 0 ? (
        <EmptyState title="Nenhum produto assado cadastrado ainda. Cadastre no catálogo antes de planejar um dia." />
      ) : (
        <ProductionDayForm
          key={date}
          date={date}
          notes={day?.notes ?? ""}
          products={products.map((product) => {
            const production = productionByProductId.get(product.id);
            return {
              roastProductId: product.id,
              name: product.name,
              unit: product.unit,
              plannedQuantity: production?.plannedQuantity.toNumber() ?? 0,
              reservedQuantity: production?.reservedQuantity.toNumber() ?? 0,
            };
          })}
        />
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-6">
        <h2 className="font-display text-base font-semibold text-ink">
          Reservas ({reservations.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {reservations.map((reservation) => {
            const tone = ROAST_RESERVATION_STATUS_TONE[reservation.status];
            return (
              <li key={reservation.id}>
                <Card padding="sm" className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">
                      {reservation.customerName}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {reservation.items.length} item(ns) · {reservation.waiter.name}
                    </div>
                  </div>
                  <StatusBadge tone={tone}>
                    {ROAST_RESERVATION_STATUS_LABELS[reservation.status]}
                  </StatusBadge>
                </Card>
              </li>
            );
          })}
          {reservations.length === 0 && (
            <EmptyState title="Nenhuma reserva para este dia ainda." />
          )}
        </ul>
      </div>
    </div>
  );
}
