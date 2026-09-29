import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { isRoastReservationEditable } from "@/domain/roast/states";
import { toDecimal } from "@/lib/money";
import { PageHeader } from "@/components/ui/card";
import { EditReservationForm } from "./edit-reservation-form";

export default async function EditarReservaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.ROASTS_EDIT);

  const reservation = await prisma.roastReservation.findUnique({
    where: { id },
    include: {
      items: true,
      productionDay: {
        include: {
          productions: {
            where: { roastProduct: { active: true } },
            include: { roastProduct: true },
            orderBy: { roastProduct: { sortOrder: "asc" } },
          },
        },
      },
    },
  });
  if (!reservation) notFound();
  if (!isRoastReservationEditable(reservation.status)) redirect(`/reservas-assados/${id}`);

  const ownQuantityByProductId = new Map<string, number>();
  for (const item of reservation.items) {
    const production = reservation.productionDay.productions.find(
      (p) => p.id === item.roastProductionId,
    );
    if (!production) continue;
    const current = ownQuantityByProductId.get(production.roastProductId) ?? 0;
    ownQuantityByProductId.set(production.roastProductId, current + item.quantity.toNumber());
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader
        title="Editar reserva"
        subtitle={reservation.productionDay.date.split("-").reverse().join("/")}
      />
      <EditReservationForm
        reservationId={reservation.id}
        customerName={reservation.customerName}
        customerPhone={reservation.customerPhone ?? ""}
        notes={reservation.notes ?? ""}
        products={reservation.productionDay.productions.map((production) => {
          const ownQuantity = ownQuantityByProductId.get(production.roastProductId) ?? 0;
          const available = toDecimal(production.plannedQuantity)
            .sub(production.reservedQuantity)
            .add(ownQuantity)
            .toNumber();
          return {
            roastProductId: production.roastProductId,
            name: production.roastProduct.name,
            unit: production.roastProduct.unit,
            available,
            initialQuantity: ownQuantity,
          };
        })}
      />
    </div>
  );
}
