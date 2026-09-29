import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { ROAST_RESERVATION_STATUS_LABELS } from "@/domain/roast/labels";
import { ROAST_RESERVATION_STATUS_TONE } from "@/components/ui/status-tone";
import { PageHeader, Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductionDayForm } from "./production-day-form";

export default async function ProducaoAssadosDiaPage({
  params,
}: {
  params: Promise<{ dayId: string }>;
}) {
  const { dayId } = await params;
  const restaurant = await getCurrentRestaurant();

  const day = await prisma.roastProductionDay.findUnique({
    where: { id: dayId },
    include: {
      productions: true,
      reservations: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true, waiter: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!day || day.restaurantId !== restaurant.id) notFound();

  const products = await prisma.roastProduct.findMany({
    where: { restaurantId: restaurant.id, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const productionByProductId = new Map(day.productions.map((p) => [p.roastProductId, p]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Produção · ${day.date.split("-").reverse().join("/")}`}
        subtitle="Quantidade planejada de cada produto para este dia."
      />
      <Link
        href="/admin/reservas-assados/producao"
        className="text-sm font-medium text-wine underline underline-offset-2"
      >
        ← Todos os dias
      </Link>

      {products.length === 0 ? (
        <EmptyState title="Nenhum produto assado cadastrado ainda. Cadastre no catálogo antes de planejar um dia." />
      ) : (
        <ProductionDayForm
          productionDayId={day.id}
          notes={day.notes ?? ""}
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
          Reservas ({day.reservations.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {day.reservations.map((reservation) => {
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
          {day.reservations.length === 0 && (
            <EmptyState title="Nenhuma reserva para este dia ainda." />
          )}
        </ul>
      </div>
    </div>
  );
}
