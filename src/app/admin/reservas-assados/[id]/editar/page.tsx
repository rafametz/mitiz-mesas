import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateRoastProduct } from "../../actions";

export default async function EditarRoastProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await prisma.roastProduct.findUnique({ where: { id } });
  if (!product) notFound();

  const updateRoastProductWithId = updateRoastProduct.bind(null, product.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">Editar produto assado</h1>
      <form action={updateRoastProductWithId} className="flex max-w-sm flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={product.name} required maxLength={80} />
        <TextField label="Unidade" name="unit" defaultValue={product.unit} required maxLength={20} />
        <TextField
          label="Ordem de exibição"
          name="sortOrder"
          type="number"
          defaultValue={product.sortOrder}
        />
        <CheckboxField label="Ativo" name="active" defaultChecked={product.active} />
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </div>
  );
}
