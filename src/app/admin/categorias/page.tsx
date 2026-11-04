import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
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
            <Th>No pedido</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <Tr key={category.id}>
              <Td>{category.name}</Td>
              <Td>{category.sortOrder}</Td>
              <Td>
                <StatusBadge tone={category.active ? "free" : "muted"}>
                  {category.active ? "Ativa" : "Inativa"}
                </StatusBadge>
              </Td>
              <Td>
                <StatusBadge tone={category.visibleInOrders ? "free" : "muted"}>
                  {category.visibleInOrders ? "Sim" : "Não"}
                </StatusBadge>
              </Td>
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
              <Td colSpan={5} className="text-muted">
                Nenhuma categoria cadastrada ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <CardList>
        {categories.map((category) => (
          <CardListRow key={category.id}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{category.name}</span>
              <Link
                href={`/admin/categorias/${category.id}/editar`}
                className="text-xs font-medium text-wine underline"
              >
                Editar
              </Link>
            </div>
            <CardListField label="Ordem">{category.sortOrder}</CardListField>
            <CardListField label="Ativa">
              <StatusBadge tone={category.active ? "free" : "muted"}>
                {category.active ? "Ativa" : "Inativa"}
              </StatusBadge>
            </CardListField>
            <CardListField label="No pedido">
              <StatusBadge tone={category.visibleInOrders ? "free" : "muted"}>
                {category.visibleInOrders ? "Sim" : "Não"}
              </StatusBadge>
            </CardListField>
          </CardListRow>
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted">Nenhuma categoria cadastrada ainda.</p>
        )}
      </CardList>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 text-base font-semibold text-ink">Nova categoria</h2>
        <form action={createCategory} className="flex max-w-sm flex-col gap-4">
          <TextField label="Nome" name="name" required maxLength={80} />
          <TextField label="Ordem de exibição" name="sortOrder" type="number" defaultValue={0} />
          <CheckboxField label="Ativa" name="active" defaultChecked />
          <CheckboxField
            label="Mostrar produtos no novo pedido (mesas e retiradas)"
            name="visibleInOrders"
            defaultChecked
          />
          <SubmitButton>Criar categoria</SubmitButton>
        </form>
      </div>
    </div>
  );
}
