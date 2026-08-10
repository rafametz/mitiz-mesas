import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { NewProductForm } from "./new-product-form";

export default async function NovoProdutoPage() {
  const restaurant = await getCurrentRestaurant();
  const [categories, sectors] = await Promise.all([
    prisma.category.findMany({ where: { restaurantId: restaurant.id, active: true } }),
    prisma.productionSector.findMany({ where: { restaurantId: restaurant.id, active: true } }),
  ]);

  const hasPrerequisites = categories.length > 0 && sectors.length > 0;

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <Link
        href="/admin/produtos"
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Produtos
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Novo produto</h1>

      {!hasPrerequisites ? (
        <p className="text-sm text-muted">
          Cadastre pelo menos uma{" "}
          <Link href="/admin/categorias" className="font-medium text-wine underline">
            categoria
          </Link>{" "}
          e um{" "}
          <Link href="/admin/setores" className="font-medium text-wine underline">
            setor
          </Link>{" "}
          antes de criar um produto.
        </p>
      ) : (
        <NewProductForm categories={categories} sectors={sectors} />
      )}
    </div>
  );
}
