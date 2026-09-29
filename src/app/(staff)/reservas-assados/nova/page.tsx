import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { availableQuantity, isValidDateKey } from "@/domain/roast/production";
import { PageHeader } from "@/components/ui/card";
import { todaySaoPaulo } from "@/lib/datetime";
import { NewReservationForm } from "./new-reservation-form";

export default async function NovaReservaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data: dataParam } = await searchParams;
  const date = dataParam && isValidDateKey(dataParam) ? dataParam : todaySaoPaulo();

  await requirePermission(PERMISSIONS.ROASTS_CREATE);
  const restaurant = await getCurrentRestaurant();

  const productionDay = await prisma.roastProductionDay.findUnique({
    where: { restaurantId_date: { restaurantId: restaurant.id, date } },
    include: {
      productions: {
        where: { roastProduct: { active: true } },
        include: { roastProduct: true },
        orderBy: { roastProduct: { sortOrder: "asc" } },
      },
    },
  });

  if (!productionDay) redirect(`/reservas-assados?data=${date}`);

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader title="Nova reserva" subtitle={date.split("-").reverse().join("/")} />
      <NewReservationForm
        restaurantId={restaurant.id}
        productionDayId={productionDay.id}
        date={date}
        products={productionDay.productions.map((production) => ({
          roastProductId: production.roastProductId,
          name: production.roastProduct.name,
          unit: production.roastProduct.unit,
          available: availableQuantity(
            production.plannedQuantity,
            production.reservedQuantity,
          ).toNumber(),
        }))}
      />
    </div>
  );
}
