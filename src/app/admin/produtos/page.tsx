import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { inputBaseClass } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { toggleAvailability } from "./actions";

// Em branco quando não há valor opcional — distingue claramente de "0"
// (um estoque de verdade zerado é um dado, "sem controle" é outro).
const EMPTY = "—";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const { q } = await searchParams;
  const query = q?.trim();

  // Busca por nome, código interno ou código de barras (ADR 0009, seção 5 —
  // preparação para o futuro PDV com leitor de código de barras, sem
  // implementar o PDV em si). `mode: "insensitive"` só existe pro
  // provedor Postgres, que é o único usado no projeto.
  const where: Prisma.ProductWhereInput = {
    restaurantId: restaurant.id,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { sku: { contains: query, mode: "insensitive" } },
            { barcode: { contains: query } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
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

      <form className="flex max-w-sm items-end gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium text-ink">
            Buscar por nome, código ou código de barras
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query ?? ""}
            placeholder="Ex.: picanha, AEA0001, 7898..."
            className={inputBaseClass}
          />
        </div>
        <button
          type="submit"
          aria-label="Buscar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control-sm border border-line text-muted hover:bg-ink/5 hover:text-ink"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>

      <Table>
        <thead>
          <Tr>
            <Th>Nome</Th>
            <Th>Código</Th>
            <Th>Categoria</Th>
            <Th>Setor</Th>
            <Th>Preço</Th>
            <Th>Estoque</Th>
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
                <Td className="tabular text-muted">{product.sku ?? EMPTY}</Td>
                <Td>{product.category.name}</Td>
                <Td>{product.defaultSector.name}</Td>
                <Td className="tabular">{formatBRL(product.price)}</Td>
                <Td className="tabular text-muted">
                  {product.stockQuantity === null
                    ? EMPTY
                    : `${product.stockQuantity.toString()} ${product.unit}`}
                </Td>
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
              <Td colSpan={8} className="text-muted">
                {query ? (
                  "Nenhum produto encontrado para esta busca."
                ) : (
                  <>
                    Nenhum produto cadastrado ainda.{" "}
                    <Link href="/admin/produtos/novo" className="font-medium text-wine underline">
                      Criar o primeiro
                    </Link>
                    .
                  </>
                )}
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
              {product.sku && <CardListField label="Código">{product.sku}</CardListField>}
              <CardListField label="Categoria">{product.category.name}</CardListField>
              <CardListField label="Setor">{product.defaultSector.name}</CardListField>
              <CardListField label="Preço">
                <span className="tabular">{formatBRL(product.price)}</span>
              </CardListField>
              {product.stockQuantity !== null && (
                <CardListField label="Estoque">
                  <span className="tabular">
                    {product.stockQuantity.toString()} {product.unit}
                  </span>
                </CardListField>
              )}
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
            {query ? (
              "Nenhum produto encontrado para esta busca."
            ) : (
              <>
                Nenhum produto cadastrado ainda.{" "}
                <Link href="/admin/produtos/novo" className="font-medium text-wine underline">
                  Criar o primeiro
                </Link>
                .
              </>
            )}
          </p>
        )}
      </CardList>
    </div>
  );
}
