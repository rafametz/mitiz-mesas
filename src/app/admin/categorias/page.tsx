import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { createCategory } from "./actions";

export default async function CategoriasPage() {
  const restaurant = await getCurrentRestaurant();
  const categories = await prisma.category.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Categorias" subtitle="Agrupam os produtos no cardápio." />

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Ordem</Th>
            <Th>Ativa</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <Tr key={category.id}>
              <Td>{category.name}</Td>
              <Td>{category.sortOrder}</Td>
              <Td>{category.active ? "Sim" : "Não"}</Td>
              <Td>
                <Link
                  href={`/admin/categorias/${category.id}/editar`}
                  className="font-medium text-wine underline"
                >
                  Editar
                </Link>
              </Td>
            </Tr>
          ))}
          {categories.length === 0 && (
            <Tr>
              <Td colSpan={4} className="text-muted">
                Nenhuma categoria cadastrada ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Nova categoria</h2>
        <form action={createCategory} className="flex max-w-sm flex-col gap-4">
          <TextField label="Nome" name="name" required maxLength={80} />
          <TextField label="Ordem de exibição" name="sortOrder" type="number" defaultValue={0} />
          <CheckboxField label="Ativa" name="active" defaultChecked />
          <SubmitButton>Criar categoria</SubmitButton>
        </form>
      </div>
    </div>
  );
}
