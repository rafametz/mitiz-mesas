import { Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { buildSalesByProduct } from "@/domain/reports/sales-by-product";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryField } from "@/components/ui/summary-field";
import { BarRow } from "@/components/ui/bar-row";
import { daysAgoSaoPaulo, saoPauloDateRange, todaySaoPaulo } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { RelatoriosTabs } from "../tabs";
import { DateRangeForm } from "../date-range-form";

// Módulo 11 — "vendas por produto": ranking de faturamento por produto no
// período, só de atendimentos CLOSED (mesmo critério de "vendas por
// período" — mesa cancelada não é venda).
export default async function RelatorioVendasPorProdutoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;
  const from = sp.de ?? daysAgoSaoPaulo(6);
  const to = sp.ate ?? todaySaoPaulo();
  const range = saoPauloDateRange(from, to);

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        serviceSession: {
          // `restaurantId` direto na sessão, nunca via `table:` (correção
          // 2026-08-20, relato do usuário: pedido de retirada com 2
          // unidades sumia do relatório) — retirada (módulo Retiradas,
          // 2026-08-14) não tem mesa (`tableId: null`), então filtrar
          // por `table: { restaurantId }` excluía essas sessões inteiras
          // do relatório sem nenhum aviso. Mesmo racional já corrigido
          // antes em relatorios/mesas/page.tsx.
          restaurantId: restaurant.id,
          status: "CLOSED",
          closedAt: { gte: range.start, lt: range.end },
        },
      },
    },
    include: { modifiers: true },
  });

  const report = buildSalesByProduct(
    items.map((item) => ({
      productId: item.productId,
      productNameAtOrder: item.productNameAtOrder,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      status: item.status,
      modifiers: item.modifiers.map((m) => ({
        priceDeltaAtOrder: m.priceDeltaAtOrder,
        quantity: m.quantity,
      })),
    })),
  );

  const top20 = report.lines.slice(0, 20);
  const maxTotal = top20[0]?.total ?? report.total;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Relatórios" subtitle="Vendas por produto" />
      <RelatoriosTabs active="produtos" />
      <DateRangeForm from={from} to={to} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryField label="Faturamento no período" value={formatBRL(report.total)} emphasis />
        <SummaryField label="Produtos diferentes vendidos" value={String(report.lines.length)} />
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Ranking por faturamento{report.lines.length > 20 ? " (20 primeiros)" : ""}
        </h2>
        {top20.length === 0 ? (
          <EmptyState icon={Package} title="Nenhuma venda neste período." />
        ) : (
          <div className="flex flex-col gap-2">
            {top20.map((line) => (
              <BarRow
                key={line.productId}
                label={line.productName}
                title={`${line.productName}: ${line.quantity}x, ${formatBRL(line.total)}`}
                valueLabel={`${line.quantity}x · ${formatBRL(line.total)}`}
                fraction={maxTotal.greaterThan(0) ? line.total.div(maxTotal).toNumber() : 0}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
