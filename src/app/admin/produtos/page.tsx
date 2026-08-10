import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { formatBRL } from "@/lib/money";
import { toggleAvailability } from "./actions";

export default async function ProdutosPage() {
  const restaurant = await getCurrentRestaurant();
  const products = await prisma.product.findMany({
    where: { restaurantId: restaurant.id },
    include: { category: true, defaultSector: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Produtos"
        subtitle="Preço e setor congelam no pedido no momento do lançamento."
        action={<Button href="/admin/produtos/novo">+ Novo produto</Button>}
      />

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Categoria</Th>
            <Th>Setor</Th>
            <Th>Preço</Th>
            <Th>Disponível</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const toggle = toggleAvailability.bind(null, product.id, !product.available);
            return (
              <Tr key={product.id}>
                <Td>{product.name}</Td>
                <Td>{product.category.name}</Td>
                <Td>{product.defaultSector.name}</Td>
                <Td className="tabular">{formatBRL(product.price)}</Td>
                <Td>
                  <form action={toggle}>
                    <button type="submit" className="font-medium text-wine underline">
                      {product.available ? "Sim" : "Não"}
                    </button>
                  </form>
                </Td>
                <Td>
                  <Link
                    href={`/admin/produtos/${product.id}/editar`}
                    className="font-medium text-wine underline"
                  >
                    Editar
                  </Link>
                </Td>
              </Tr>
            );
          })}
          {products.length === 0 && (
            <Tr>
              <Td colSpan={6} className="text-muted">
                Nenhum produto cadastrado ainda.{" "}
                <Link href="/admin/produtos/novo" className="font-medium text-wine underline">
                  Criar o primeiro
                </Link>
                .
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <CardList>
        {products.map((product) => {
          const toggle = toggleAvailability.bind(null, product.id, !product.available);
          return (
            <CardListRow key={product.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-ink">{product.name}</span>
                <Link
                  href={`/admin/produtos/${product.id}/editar`}
                  className="text-xs font-medium text-wine underline"
                >
                  Editar
                </Link>
              </div>
              <CardListField label="Categoria">{product.category.name}</CardListField>
              <CardListField label="Setor">{product.defaultSector.name}</CardListField>
              <CardListField label="Preço">
                <span className="tabular">{formatBRL(product.price)}</span>
              </CardListField>
              <CardListField label="Disponível">
                <form action={toggle}>
                  <button type="submit" className="font-medium text-wine underline">
                    {product.available ? "Sim" : "Não"}
                  </button>
                </form>
              </CardListField>
            </CardListRow>
          );
        })}
        {products.length === 0 && (
          <p className="text-sm text-muted">
            Nenhum produto cadastrado ainda.{" "}
            <Link href="/admin/produtos/novo" className="font-medium text-wine underline">
              Criar o primeiro
            </Link>
            .
          </p>
        )}
      </CardList>
    </div>
  );
}
