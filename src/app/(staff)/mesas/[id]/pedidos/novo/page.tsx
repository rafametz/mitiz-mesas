import { redirect } from "next/navigation";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { formatTableLabel } from "@/domain/table/labels";
import { PageHeader } from "@/components/ui/card";
import { NewOrderForm } from "./new-order-form";

export default async function NovoPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.ORDERS_CREATE);
  const { table, session } = await getTableWithActiveSession(id);
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
      <div className="flex flex-col gap-4 py-4">
        <PageHeader title="Novo pedido" subtitle={formatTableLabel(table.number)} />
        <p className="text-sm text-muted">
          Nenhum produto disponível. Cadastre produtos em Administração antes de lançar pedidos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Novo pedido" subtitle={formatTableLabel(table.number)} />
      <NewOrderForm
        redirectPath={`/mesas/${id}`}
        serviceSessionId={session.id}
        // Pessoa SETTLED (já quitou a parte dela — pagamento por pessoa,
        // revisão 2026-08-10) some do seletor por padrão, mas nada do que
        // já foi lançado pra ela antes é apagado ou desvinculado.
        guests={session.guests
          .filter((guest) => guest.status === "ACTIVE")
          .map((guest) => ({ id: guest.id, name: guest.name ?? "(sem nome)" }))}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.price.toString(),
          categoryId: product.categoryId,
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
    </div>
  );
}
