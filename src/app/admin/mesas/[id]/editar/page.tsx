import { notFound } from "next/navigation";
import { TableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { TABLE_STATUS_LABELS } from "@/domain/table/labels";
import { updateTable } from "../../actions";

export default async function EditarMesaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table) notFound();

  const updateTableWithId = updateTable.bind(null, table.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">Editar mesa</h1>
      <form action={updateTableWithId} className="flex max-w-sm flex-col gap-4">
        <TextField
          label="Número ou nome"
          name="number"
          defaultValue={table.number}
          required
          maxLength={20}
          placeholder="Ex.: 1 ou Varanda 3"
          hint={`Não inclua a palavra "Mesa": ela já aparece automaticamente nas telas.`}
        />
        <TextField
          label="Capacidade (opcional)"
          name="capacity"
          type="number"
          min={1}
          defaultValue={table.capacity ?? undefined}
        />
        <SelectField label="Status" name="status" defaultValue={table.status}>
          {Object.values(TableStatus).map((status) => (
            <option key={status} value={status}>
              {TABLE_STATUS_LABELS[status]}
            </option>
          ))}
        </SelectField>
        <p className="text-xs text-muted">
          Não há como apagar uma mesa (histórico de atendimento fica preservado, CLAUDE.md regra
          25). Para tirá-la de operação sem apagar, use o status <strong>Bloqueada</strong>.
        </p>
        <SubmitButton>Salvar</SubmitButton>
      </form>
    </div>
  );
}
