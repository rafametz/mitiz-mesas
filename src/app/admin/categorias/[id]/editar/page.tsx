import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateCategory } from "../../actions";

export default async function EditarCategoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) notFound();

  const updateCategoryWithId = updateCategory.bind(null, category.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">Editar categoria</h1>
      <form action={updateCategoryWithId} className="flex max-w-sm flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={category.name} required maxLength={80} />
        <TextField
          label="Ordem de exibição"
          name="sortOrder"
          type="number"
          defaultValue={category.sortOrder}
        />
        <CheckboxField label="Ativa" name="active" defaultChecked={category.active} />
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </div>
  );
}
