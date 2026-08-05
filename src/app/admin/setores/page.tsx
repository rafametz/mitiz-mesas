import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { createSector } from "./actions";

export default async function SetoresPage() {
  const restaurant = await getCurrentRestaurant();
  const sectors = await prisma.productionSector.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Setores de produção"
        subtitle="Cozinha, Parrilla, Bar, Caixa, Sem impressão etc. — CLAUDE.md seção 6."
      />

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Imprime?</Th>
            <Th>Ordem</Th>
            <Th>Ativo</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {sectors.map((sector) => (
            <Tr key={sector.id}>
              <Td>{sector.name}</Td>
              <Td>{sector.hasPrinting ? "Sim" : "Não"}</Td>
              <Td>{sector.sortOrder}</Td>
              <Td>{sector.active ? "Sim" : "Não"}</Td>
              <Td>
                <Link
                  href={`/admin/setores/${sector.id}/editar`}
                  className="font-medium text-wine underline"
                >
                  Editar
                </Link>
              </Td>
            </Tr>
          ))}
          {sectors.length === 0 && (
            <Tr>
              <Td colSpan={5} className="text-muted">
                Nenhum setor cadastrado ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Novo setor</h2>
        <form action={createSector} className="flex max-w-sm flex-col gap-4">
          <TextField label="Nome" name="name" required maxLength={80} />
          <TextField label="Ordem de exibição" name="sortOrder" type="number" defaultValue={0} />
          <CheckboxField label="Gera impressão" name="hasPrinting" defaultChecked />
          <CheckboxField label="Ativo" name="active" defaultChecked />
          <SubmitButton>Criar setor</SubmitButton>
        </form>
      </div>
    </div>
  );
}
