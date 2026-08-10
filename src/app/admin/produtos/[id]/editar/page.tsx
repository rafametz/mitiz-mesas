import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { ModifiersSection } from "../modifiers-section";
import { EditProductForm } from "./edit-product-form";

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const restaurant = await getCurrentRestaurant();
  const [product, categories, sectors] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ where: { restaurantId: restaurant.id } }),
    prisma.productionSector.findMany({ where: { restaurantId: restaurant.id } }),
  ]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/produtos"
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Produtos
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Editar produto</h1>

      <EditProductForm
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price.toString(),
          categoryId: product.categoryId,
          defaultSectorId: product.defaultSectorId,
          available: product.available,
          active: product.active,
        }}
        categories={categories}
        sectors={sectors}
      />

      <ModifiersSection productId={product.id} />
    </div>
  );
}
