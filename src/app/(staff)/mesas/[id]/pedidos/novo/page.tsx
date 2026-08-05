import { redirect } from "next/navigation";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { NewOrderForm } from "./new-order-form";

export default async function NovoPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.ORDERS_CREATE);
  const { session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);

  const restaurant = await getCurrentRestaurant();
  const products = await prisma.product.findMany({
    where: { restaurantId: restaurant.id, active: true, available: true },
    include: {
      category: true,
      modifierGroups: {
        where: { active: true },
        include: { modifiers: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  if (products.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        Nenhum produto disponível — cadastre produtos em Administração antes de lançar pedidos.
      </p>
    );
  }

  return (
    <NewOrderForm
      tableId={id}
      serviceSessionId={session.id}
      guests={session.guests.map((guest) => ({ id: guest.id, name: guest.name ?? "(sem nome)" }))}
      products={products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price.toString(),
        categoryName: product.category.name,
        modifierGroups: product.modifierGroups.map((group) => ({
          id: group.id,
          name: group.name,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          modifiers: group.modifiers.map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceDelta: modifier.priceDelta.toString(),
          })),
        })),
      }))}
    />
  );
}
