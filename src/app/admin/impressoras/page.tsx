import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { createPrinter } from "./actions";

export default async function ImpressorasPage() {
  const restaurant = await getCurrentRestaurant();
  const printers = await prisma.printer.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Impressoras"
        subtitle="O MVP usa uma impressora térmica única. Ver docs/printing/architecture.md."
      />

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Conexão</Th>
            <Th>Token do agente</Th>
            <Th>Ativa</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {printers.map((printer) => (
            <Tr key={printer.id}>
              <Td>{printer.name}</Td>
              <Td>{printer.connectionInfo ?? "-"}</Td>
              <Td>
                {printer.agentTokenHash ? (
                  <span className="text-ink">Configurado</span>
                ) : (
                  <span className="text-gold-dark">Sem token: agente não consegue puxar a fila</span>
                )}
              </Td>
              <Td>{printer.active ? "Sim" : "Não"}</Td>
              <Td>
                <Link
                  href={`/admin/impressoras/${printer.id}/editar`}
                  className="font-medium text-wine underline"
                >
                  Editar
                </Link>
              </Td>
            </Tr>
          ))}
          {printers.length === 0 && (
            <Tr>
              <Td colSpan={5} className="text-muted">
                Nenhuma impressora cadastrada ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Nova impressora</h2>
        <form action={createPrinter} className="flex max-w-sm flex-col gap-4">
          <TextField label="Nome" name="name" required maxLength={80} placeholder="Balcão" />
          <TextField
            label="Conexão (opcional, anotação livre)"
            name="connectionInfo"
            maxLength={200}
            placeholder="Epson TM-T20, USB, PC do caixa"
          />
          <CheckboxField label="Ativa" name="active" defaultChecked />
          <SubmitButton>Criar impressora</SubmitButton>
        </form>
      </div>
    </div>
  );
}
