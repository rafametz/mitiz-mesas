import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { ModifiersSection } from "../modifiers-section";
import { EditProductForm } from "./edit-product-form";

// Decimal do Prisma (ou null) -> string pro <input defaultValue=...>, nunca
// passando por `number` no caminho (regra 20/21 do CLAUDE.md).
function decimalToInput(value: { toString(): string } | null): string {
  return value === null ? "" : value.toString();
}

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
        productId={product.id}
        defaults={{
          name: product.name,
          description: product.description ?? "",
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          brand: product.brand ?? "",
          unit: product.unit,
          categoryId: product.categoryId,
          defaultSectorId: product.defaultSectorId,
          available: product.available,
          active: product.active,
          price: product.price.toString(),
          costPrice: decimalToInput(product.costPrice),
          stockQuantity: decimalToInput(product.stockQuantity),
          stockMinimum: decimalToInput(product.stockMinimum),
          weight: decimalToInput(product.weight),
          netWeight: decimalToInput(product.netWeight),
          ncm: product.ncm ?? "",
          cest: product.cest ?? "",
          origin: product.origin === null ? "" : String(product.origin),
          icmsRate: decimalToInput(product.icmsRate),
          ipiRate: decimalToInput(product.ipiRate),
          pisRate: decimalToInput(product.pisRate),
          cofinsRate: decimalToInput(product.cofinsRate),
          taxableUnit: product.taxableUnit ?? "",
          fiscalBenefitCode: product.fiscalBenefitCode ?? "",
          fiscalClassType: product.fiscalClassType ?? "",
          supplierName: product.supplierName ?? "",
          supplierCode: product.supplierCode ?? "",
          importNotes: product.importNotes ?? "",
        }}
        categories={categories}
        sectors={sectors}
      />

      <ModifiersSection productId={product.id} />
    </div>
  );
}
