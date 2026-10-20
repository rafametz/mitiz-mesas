import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PageHeader } from "@/components/ui/card";
import { AtendimentoTabs } from "../atendimento-tabs";
import { PdvSaleScreen } from "./pdv-sale-screen";

// Venda de balcão (Módulo 17, docs/backlog.md — Fase 2 do roadmap MITIZ
// Gestão, 2026-10-20): catálogo inteiro disponível aqui (não só a
// categoria Loja — `category.visibleInOrders` é sobre esconder a Loja do
// pedido de MESA, não sobre restringir o PDV; o pedido original da Fase 1
// já define o cadastro de produtos como catálogo único e compartilhado).
export default async function PdvPage() {
  await requirePermission(PERMISSIONS.PDV_SELL);
  const restaurant = await getCurrentRestaurant();

  const [products, paymentMethods] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: restaurant.id, active: true, available: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.paymentMethod.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pt-6 lg:gap-5">
      <AtendimentoTabs active="pdv" canSellPdv />
      <PageHeader title="PDV" subtitle="Venda de balcão" />

      {products.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum produto disponível. Cadastre produtos em Administração antes de vender.
        </p>
      ) : (
        <PdvSaleScreen
          restaurantId={restaurant.id}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price.toString(),
            sku: product.sku,
            barcode: product.barcode,
            categoryId: product.categoryId,
            categoryName: product.category.name,
          }))}
          paymentMethods={paymentMethods.map((method) => ({ id: method.id, name: method.name }))}
        />
      )}
    </main>
  );
}
