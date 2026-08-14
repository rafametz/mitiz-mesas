import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PageHeader } from "@/components/ui/card";
import { NewPickupForm } from "./new-pickup-form";

// Mesma permissão de abrir mesa (TABLES_OPEN) — hipótese reversível
// confirmada com o usuário 2026-08-14, sem criar um código de permissão
// só para retirada.
export default async function NovaRetiradaPage() {
  const user = await requirePermission(PERMISSIONS.TABLES_OPEN);
  const restaurant = await getCurrentRestaurant();

  const waiters = await prisma.user.findMany({
    where: { restaurantId: restaurant.id, active: true, role: { name: { in: ["WAITER", "ADMIN"] } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Nova retirada" subtitle="Pedido avulso, sem ocupar mesa" />
      <NewPickupForm
        waiters={waiters.map((w) => ({ id: w.id, name: w.name }))}
        currentUserId={user.id}
      />
    </div>
  );
}
