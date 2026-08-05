import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { updatePrinter } from "../../actions";
import { RegenerateTokenForm } from "./regenerate-token-form";

export default async function EditarImpressoraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const printer = await prisma.printer.findUnique({ where: { id } });
  if (!printer) notFound();

  const updatePrinterWithId = updatePrinter.bind(null, printer.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-lg font-semibold text-ink">Editar impressora</h1>
      <form action={updatePrinterWithId} className="flex max-w-sm flex-col gap-4">
        <TextField label="Nome" name="name" defaultValue={printer.name} required maxLength={80} />
        <TextField
          label="Conexão (opcional, anotação livre)"
          name="connectionInfo"
          defaultValue={printer.connectionInfo ?? undefined}
          maxLength={200}
        />
        <CheckboxField label="Ativa" name="active" defaultChecked={printer.active} />
        <SubmitButton>Salvar</SubmitButton>
      </form>

      <RegenerateTokenForm printerId={printer.id} />
    </div>
  );
}
