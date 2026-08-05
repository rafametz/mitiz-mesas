import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateProduct } from "../../actions";
import { ModifiersSection } from "../modifiers-section";

export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const restaurant = await getCurrentRestaurant();
  const [product, categories, sectors] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ where: { restaurantId: restaurant.id } }),
    prisma.productionSector.findMany({ where: { restaurantId: restaurant.id } }),
  ]);
  if (!product) notFound();

  const updateProductWithId = updateProduct.bind(null, product.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">Editar produto</h1>
      <form action={updateProductWithId} className="flex max-w-sm flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={product.name} required maxLength={120} />
        <TextAreaField
          label="Descrição (opcional)"
          name="description"
          defaultValue={product.description ?? ""}
          maxLength={500}
        />
        <TextField
          label="Preço (R$)"
          name="price"
          inputMode="decimal"
          defaultValue={product.price.toString()}
          required
        />
        <SelectField label="Categoria" name="categoryId" defaultValue={product.categoryId} required>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Setor de destino"
          name="defaultSectorId"
          defaultValue={product.defaultSectorId}
          required
        >
          {sectors.map((sector) => (
            <option key={sector.id} value={sector.id}>
              {sector.name}
            </option>
          ))}
        </SelectField>
        <CheckboxField label="Disponível" name="available" defaultChecked={product.available} />
        <CheckboxField label="Ativo" name="active" defaultChecked={product.active} />
        <SubmitButton>Salvar</SubmitButton>
      </form>

      <ModifiersSection productId={product.id} />
    </div>
  );
}
