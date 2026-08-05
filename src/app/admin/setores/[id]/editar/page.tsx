import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateSector } from "../../actions";

export default async function EditarSetorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sector = await prisma.productionSector.findUnique({ where: { id } });
  if (!sector) notFound();

  const updateSectorWithId = updateSector.bind(null, sector.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">Editar setor</h1>
      <form action={updateSectorWithId} className="flex max-w-sm flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={sector.name} required maxLength={80} />
        <TextField
          label="Ordem de exibição"
          name="sortOrder"
          type="number"
          defaultValue={sector.sortOrder}
        />
        <CheckboxField
          label="Gera impressão"
          name="hasPrinting"
          defaultChecked={sector.hasPrinting}
        />
        <CheckboxField label="Ativo" name="active" defaultChecked={sector.active} />
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </div>
  );
}
