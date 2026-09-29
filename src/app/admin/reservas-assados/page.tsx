import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { CheckboxField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { PageHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { createRoastProduct } from "./actions";

export default async function ReservasAssadosProdutosPage() {
  const restaurant = await getCurrentRestaurant();
  const products = await prisma.roastProduct.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Reservas de Assados"
        subtitle="Catálogo de produtos que podem ser reservados por dia."
      />
      <Link
        href="/admin/reservas-assados/producao"
        className="text-sm font-medium text-wine underline underline-offset-2"
      >
        Configurar produção por dia →
      </Link>

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Unidade</Th>
            <Th>Ordem</Th>
            <Th>Ativo</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <Tr key={product.id}>
              <Td>{product.name}</Td>
              <Td>{product.unit}</Td>
              <Td>{product.sortOrder}</Td>
              <Td>{product.active ? "Sim" : "Não"}</Td>
              <Td>
                <Link
                  href={`/admin/reservas-assados/${product.id}/editar`}
                  className="font-medium text-wine underline"
                >
                  Editar
                </Link>
              </Td>
            </Tr>
          ))}
          {products.length === 0 && (
            <Tr>
              <Td colSpan={5} className="text-muted">
                Nenhum produto assado cadastrado ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Novo produto</h2>
        <form action={createRoastProduct} className="flex max-w-sm flex-col gap-4">
          <TextField label="Nome" name="name" required maxLength={80} placeholder="Côstela de boi" />
          <TextField label="Unidade" name="unit" required maxLength={20} placeholder="kg" />
          <TextField label="Ordem de exibição" name="sortOrder" type="number" defaultValue={0} />
          <CheckboxField label="Ativo" name="active" defaultChecked />
          <SubmitButton>Criar produto</SubmitButton>
        </form>
      </div>
    </div>
  );
}
