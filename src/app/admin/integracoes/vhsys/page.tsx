import { Fragment } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { isVhsysConfigured, listVhsysProducts, VhsysApiError, VhsysConfigError } from "@/lib/vhsys/client";
import { PageHeader, Card } from "@/components/ui/card";
import { CardList, CardListField, CardListRow, Table, Td, Th, Tr } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinkProductForm } from "./link-product-form";
import { MatchPanel } from "./match-panel";

// Integração VHSYS (Vendas Balcão/PDV) — Fase 1, aprovada pelo usuário em
// 2026-08-25: só o vínculo manual Product ↔ id_produto VHSYS. O envio
// automático da venda ao fechar a mesa é uma etapa futura separada, ainda
// não implementada.
export default async function VhsysIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ semVinculo?: string; buscar?: string; termo?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const onlyUnlinked = sp.semVinculo === "1";

  function hrefWithParams(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (onlyUnlinked) params.set("semVinculo", "1");
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    return `/admin/integracoes/vhsys${qs ? `?${qs}` : ""}`;
  }

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

  // Painel "Buscar vínculo" (pedido do usuário 2026-08-29): ao clicar na
  // linha de um produto, busca automaticamente na VHSYS pelo próprio nome
  // do produto — o operador não precisa mais copiar/colar o id_produto à
  // mão. `termo` na URL sobrescreve quando o operador ajusta a busca
  // (nomenclatura da VHSYS costuma ser abreviada/diferente da do MITIZ).
  const expandedProduct = sp.buscar ? (products.find((p) => p.id === sp.buscar) ?? null) : null;
  const searchTerm = (sp.termo?.trim() || expandedProduct?.name) ?? "";

  let matchResults: Awaited<ReturnType<typeof listVhsysProducts>>["products"] = [];
  let matchError: string | null = null;
  if (expandedProduct && configured && searchTerm) {
    try {
      const result = await listVhsysProducts({ descProduto: searchTerm, limit: 10 });
      matchResults = result.products;
    } catch (error) {
      matchError =
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

      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink">Produtos do MITIZ Mesas</h2>
          <Link href={hrefWithParams({ semVinculo: onlyUnlinked ? undefined : "1" })} className="text-sm font-medium text-wine underline">
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
            {products.map((product) => {
              const isExpanded = expandedProduct?.id === product.id;
              return (
                <Fragment key={product.id}>
                  <Tr>
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
                      <div className="flex flex-col items-start gap-1.5">
                        <LinkProductForm productId={product.id} currentVhsysProductId={product.vhsysProductId} />
                        <Link
                          href={isExpanded ? hrefWithParams({}) : hrefWithParams({ buscar: product.id })}
                          className="text-xs font-medium text-wine underline"
                        >
                          {isExpanded ? "Fechar busca" : "Buscar vínculo"}
                        </Link>
                      </div>
                    </Td>
                  </Tr>
                  {isExpanded && (
                    <Tr>
                      <Td colSpan={4} className="bg-ink/[0.015]">
                        <MatchPanel
                          productId={product.id}
                          productName={product.name}
                          term={searchTerm}
                          results={matchResults}
                          error={matchError}
                          configured={configured}
                          closeHref={hrefWithParams({})}
                        />
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              );
            })}
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
          {products.map((product) => {
            const isExpanded = expandedProduct?.id === product.id;
            return (
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
                <div className="flex flex-col items-start gap-1.5 pt-1">
                  <LinkProductForm productId={product.id} currentVhsysProductId={product.vhsysProductId} />
                  <Link
                    href={isExpanded ? hrefWithParams({}) : hrefWithParams({ buscar: product.id })}
                    className="text-xs font-medium text-wine underline"
                  >
                    {isExpanded ? "Fechar busca" : "Buscar vínculo"}
                  </Link>
                </div>
                {isExpanded && (
                  <div className="pt-2">
                    <MatchPanel
                      productId={product.id}
                      productName={product.name}
                      term={searchTerm}
                      results={matchResults}
                      error={matchError}
                      configured={configured}
                      closeHref={hrefWithParams({})}
                    />
                  </div>
                )}
              </CardListRow>
            );
          })}
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
