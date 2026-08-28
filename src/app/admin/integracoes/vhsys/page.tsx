import Link from "next/link";
import { CircleAlert, CircleCheck, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { isVhsysConfigured, listVhsysProducts, VhsysApiError, VhsysConfigError } from "@/lib/vhsys/client";
import { PageHeader, Card } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBRL } from "@/lib/money";
import { LinkProductForm } from "./link-product-form";

// Integração VHSYS (Vendas Balcão/PDV) — Fase 1, aprovada pelo usuário em
// 2026-08-25: só o vínculo manual Product ↔ id_produto VHSYS. O envio
// automático da venda ao fechar a mesa é uma etapa futura separada, ainda
// não implementada (ver análise na conversa/ADR quando registrada).
export default async function VhsysIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; semVinculo?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const query = sp.q?.trim() ?? "";
  const onlyUnlinked = sp.semVinculo === "1";

  const products = await prisma.product.findMany({
    where: {
      restaurantId: restaurant.id,
      active: true,
      ...(onlyUnlinked ? { vhsysProductId: null } : {}),
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const configured = isVhsysConfigured();

  let searchResults: Awaited<ReturnType<typeof listVhsysProducts>>["products"] = [];
  let searchError: string | null = null;
  if (query && configured) {
    try {
      const result = await listVhsysProducts({ descProduto: query, limit: 20 });
      searchResults = result.products;
    } catch (error) {
      searchError =
        error instanceof VhsysConfigError || error instanceof VhsysApiError
          ? error.message
          : "Não foi possível buscar produtos na VHSYS agora.";
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Integração VHSYS"
        subtitle="Vínculo de produtos com o PDV (Vendas Balcão). O envio automático da venda ao fechar a mesa ainda não está ativo."
      />

      <Card>
        <div className="flex items-center gap-2 text-sm">
          {configured ? (
            <>
              <CircleCheck className="h-4 w-4 shrink-0 text-free-dark" aria-hidden="true" />
              <span className="text-ink">Credenciais da VHSYS configuradas.</span>
            </>
          ) : (
            <>
              <CircleAlert className="h-4 w-4 shrink-0 text-gold-dark" aria-hidden="true" />
              <span className="text-ink">
                Credenciais não configuradas. Defina{" "}
                <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">VHSYS_ACCESS_TOKEN</code> e{" "}
                <code className="rounded bg-ink/5 px-1 py-0.5 text-xs">VHSYS_SECRET_ACCESS_TOKEN</code>{" "}
                nas variáveis de ambiente para buscar produtos.
              </span>
            </>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Buscar produto na VHSYS</h2>
        <form className="flex flex-wrap items-end gap-2">
          {onlyUnlinked && <input type="hidden" name="semVinculo" value="1" />}
          <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Nome do produto</span>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Ex.: Chope Pilsen"
              className="h-10 rounded-control-sm border border-line bg-surface px-3 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <button
            type="submit"
            className="flex h-10 items-center gap-1.5 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Buscar
          </button>
        </form>

        {query && (
          <div className="mt-4">
            {searchError ? (
              <p className="text-sm text-wine">{searchError}</p>
            ) : searchResults.length === 0 ? (
              <EmptyState title={`Nenhum produto encontrado na VHSYS para "${query}".`} />
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {searchResults.map((product) => (
                  <li
                    key={product.idProduto}
                    className="flex items-center justify-between gap-3 rounded-control-sm bg-ink/5 px-3 py-2"
                  >
                    <span className="text-ink">{product.descProduto}</span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {product.valorProduto && <span>{formatBRL(product.valorProduto)}</span>}
                      <span className="tabular font-semibold text-ink">id_produto: {product.idProduto}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Produtos do MITIZ Mesas</h2>
          <Link
            href={onlyUnlinked ? "/admin/integracoes/vhsys" : "/admin/integracoes/vhsys?semVinculo=1"}
            className="text-sm font-medium text-wine underline"
          >
            {onlyUnlinked ? "Ver todos" : "Somente sem vínculo"}
          </Link>
        </div>

        <Table>
          <thead>
            <Tr>
              <Th>Produto</Th>
              <Th>Categoria</Th>
              <Th>Vínculo VHSYS</Th>
              <Th />
            </Tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <Tr key={product.id}>
                <Td>{product.name}</Td>
                <Td>{product.category.name}</Td>
                <Td>
                  {product.vhsysProductId ? (
                    <StatusBadge tone="free">id_produto {product.vhsysProductId}</StatusBadge>
                  ) : (
                    <StatusBadge tone="gold">Sem vínculo</StatusBadge>
                  )}
                </Td>
                <Td>
                  <LinkProductForm productId={product.id} currentVhsysProductId={product.vhsysProductId} />
                </Td>
              </Tr>
            ))}
            {products.length === 0 && (
              <Tr>
                <Td colSpan={4} className="text-muted">
                  {onlyUnlinked
                    ? "Todos os produtos ativos já têm vínculo."
                    : "Nenhum produto ativo cadastrado ainda."}
                </Td>
              </Tr>
            )}
          </tbody>
        </Table>

        <CardList>
          {products.map((product) => (
            <CardListRow key={product.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-ink">{product.name}</span>
                {product.vhsysProductId ? (
                  <StatusBadge tone="free">id_produto {product.vhsysProductId}</StatusBadge>
                ) : (
                  <StatusBadge tone="gold">Sem vínculo</StatusBadge>
                )}
              </div>
              <CardListField label="Categoria">{product.category.name}</CardListField>
              <div className="pt-1">
                <LinkProductForm productId={product.id} currentVhsysProductId={product.vhsysProductId} />
              </div>
            </CardListRow>
          ))}
          {products.length === 0 && (
            <p className="text-sm text-muted">
              {onlyUnlinked
                ? "Todos os produtos ativos já têm vínculo."
                : "Nenhum produto ativo cadastrado ainda."}
            </p>
          )}
        </CardList>
      </div>
    </div>
  );
}
