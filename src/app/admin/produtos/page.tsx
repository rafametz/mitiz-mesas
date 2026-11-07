import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { inputBaseClass } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { toggleAvailability } from "./actions";

// Em branco quando não há valor opcional — distingue claramente de "0"
// (um estoque de verdade zerado é um dado, "sem controle" é outro).
const EMPTY = "—";

// Relato do usuário 2026-11-07: tela lenta pra carregar, sem paginação
// trazia o catálogo inteiro de uma vez só. 50 por página, pedido explícito.
const PAGE_SIZE = 50;

// Estoque negativo é sinal de inconsistência (venda sem baixa correta,
// contagem desatualizada) — precisa chamar atenção, não aparecer igual a
// qualquer outro valor (achado da auditoria visual de 2026-11-04, Fase 10).
function StockQuantity({ quantity, unit }: { quantity: Prisma.Decimal; unit: string }) {
  const text = `${quantity.toString()} ${unit}`;
  if (quantity.lessThan(0)) {
    return (
      <StatusBadge tone="wine">
        <span className="tabular">{text}</span>
      </StatusBadge>
    );
  }
  return <span className="tabular">{text}</span>;
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim();
  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

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

  const totalProducts = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalProducts / PAGE_SIZE));
  // Página pedida além do fim (ex.: busca que encolheu a lista) volta pra
  // última página válida em vez de mostrar uma tela vazia sem explicação.
  const safePage = Math.min(page, totalPages);

  const products = await prisma.product.findMany({
    where,
    include: { category: true, defaultSector: true },
    orderBy: { name: "asc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  function buildPageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/admin/produtos?${qs}` : "/admin/produtos";
  }

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
            <Th className="sticky right-0 bg-surface" />
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
                  {product.stockQuantity === null ? (
                    EMPTY
                  ) : (
                    <StockQuantity quantity={product.stockQuantity} unit={product.unit} />
                  )}
                </Td>
                <Td>
                  <form action={toggle}>
                    <button type="submit" className="font-medium text-wine underline">
                      {product.available ? "Sim" : "Não"}
                    </button>
                  </form>
                </Td>
                <Td className="sticky right-0 border-l border-line bg-surface">
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
                <span className="font-semibold text-ink">{product.name}</span>
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
                  <StockQuantity quantity={product.stockQuantity} unit={product.unit} />
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

      {totalProducts > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalProducts)}{" "}
            de {totalProducts} produto{totalProducts === 1 ? "" : "s"}
          </p>
          <Pagination page={safePage} totalPages={totalPages} buildHref={buildPageHref} />
        </div>
      )}
    </div>
  );
}
