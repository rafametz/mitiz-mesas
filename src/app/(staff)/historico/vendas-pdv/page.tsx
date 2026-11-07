import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { formatBRL, toDecimal, ZERO } from "@/lib/money";
import { formatDateTime, saoPauloDateRange, todaySaoPaulo } from "@/lib/datetime";
import {
  resolveSalesDatePreset,
  SALES_DATE_PRESET_LABELS,
  type SalesDatePreset,
} from "@/domain/pdv/sales-date-presets";
import { HistoricoTabs } from "../tabs";

const PAGE_SIZE = 50;
const PRESETS: SalesDatePreset[] = ["current_week", "current_month", "previous_month"];

// Gestão de vendas do PDV (pedido do usuário, 2026-11-08: "uma tela de
// gestão das vendas feitas em PDV, que liste todas as vendas, tenha
// filtro de data... mês atual, semana atual, mês anterior... um resumo
// da venda... entrar e ver os valores, o que foi feito, e que tem uma
// possibilidade de estornar"). Mesma permissão de Histórico/Auditoria
// (AUDIT_VIEW — Admin e Caixa), fora de /admin pelo mesmo motivo de
// historico/page.tsx: Garçom/Produção não têm AUDIT_VIEW.
//
// `totalAmount` zerado é o sinal de venda estornada (reversePdvSale zera
// subtotal/desconto/taxa/total/pago/saldo junto) — nenhuma venda legítima
// fecha com total R$0,00 (sell-pdv.ts sempre exige ao menos um pagamento
// positivo), então não precisa de uma coluna própria "estornada".
export default async function VendasPdvPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; de?: string; ate?: string; page?: string }>;
}) {
  await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const restaurant = await getCurrentRestaurant();
  const sp = await searchParams;

  const today = todaySaoPaulo();
  const activePreset = PRESETS.includes(sp.preset as SalesDatePreset)
    ? (sp.preset as SalesDatePreset)
    : null;
  const customRange = !activePreset && sp.de && sp.ate ? { from: sp.de, to: sp.ate } : null;
  const { from, to } = activePreset
    ? resolveSalesDatePreset(activePreset, today)
    : (customRange ?? resolveSalesDatePreset("current_month", today));
  const invalidRange = from > to;

  const requestedPage = Number(sp.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { start, end } = saoPauloDateRange(from, to);
  const where = {
    restaurantId: restaurant.id,
    type: "PDV" as const,
    // Intervalo invertido não quebra a consulta — só devolve zero linhas
    // até o operador corrigir as datas (mesmo racional de
    // resolveReportDateRange, admin/relatorios).
    openedAt: invalidRange ? { gte: start, lt: start } : { gte: start, lt: end },
  };

  const totalSales = await prisma.serviceSession.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalSales / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const [sumAgg, reversedCount, sessions] = await Promise.all([
    prisma.serviceSession.aggregate({ where, _sum: { totalAmount: true } }),
    prisma.serviceSession.count({ where: { ...where, totalAmount: 0 } }),
    prisma.serviceSession.findMany({
      where,
      include: { waiter: true, payments: { include: { paymentMethod: true } } },
      orderBy: { openedAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalRevenue = sumAgg._sum.totalAmount ?? ZERO;
  const completedCount = totalSales - reversedCount;
  const averageTicket = completedCount > 0 ? toDecimal(totalRevenue).div(completedCount) : ZERO;

  function buildHref(params: Record<string, string | number | undefined>) {
    const qs = new URLSearchParams();
    const merged = { preset: activePreset ?? undefined, de: customRange?.from, ate: customRange?.to, ...params };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") qs.set(key, String(value));
    }
    const query = qs.toString();
    return query ? `/historico/vendas-pdv?${query}` : "/historico/vendas-pdv";
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader title="Histórico" subtitle="Vendas de balcão registradas no PDV." />
      <HistoricoTabs active="vendas-pdv" />

      <Card padding="sm" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Período">
          {PRESETS.map((preset) => {
            const isActive = activePreset === preset;
            return (
              <Link
                key={preset}
                href={buildHref({ preset, de: undefined, ate: undefined, page: undefined })}
                role="tab"
                aria-selected={isActive}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? "bg-wine text-bg" : "border border-line text-ink hover:bg-ink/5"
                }`}
              >
                {SALES_DATE_PRESET_LABELS[preset]}
              </Link>
            );
          })}
        </div>

        <form className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">De</span>
            <input
              type="date"
              name="de"
              defaultValue={from}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-muted">Até</span>
            <input
              type="date"
              name="ate"
              defaultValue={to}
              className="h-10 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            Filtrar
          </button>
        </form>

        {invalidRange && (
          <p role="alert" className="text-sm text-wine">
            A data inicial não pode ser depois da data final.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card padding="sm">
          <div className="text-xs text-muted">Total vendido</div>
          <div className="tabular text-lg font-semibold text-ink">{formatBRL(totalRevenue)}</div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-muted">Vendas</div>
          <div className="tabular text-lg font-semibold text-ink">{totalSales}</div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-muted">Estornadas</div>
          <div className="tabular text-lg font-semibold text-ink">{reversedCount}</div>
        </Card>
        <Card padding="sm">
          <div className="text-xs text-muted">Ticket médio</div>
          <div className="tabular text-lg font-semibold text-ink">{formatBRL(averageTicket)}</div>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        {sessions.length === 0 && (
          <EmptyState icon={ShoppingBag} title="Nenhuma venda do PDV neste período." />
        )}
        {sessions.map((session) => {
          const reversed = session.totalAmount.isZero();
          const methodNames = [...new Set(session.payments.map((p) => p.paymentMethod.name))];
          return (
            <Link key={session.id} href={`/historico/vendas-pdv/${session.id}`}>
              <Card padding="sm" className="flex items-center justify-between gap-3 hover:border-wine/40">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">
                      {formatDateTime(session.openedAt)}
                    </span>
                    <StatusBadge tone={reversed ? "wine" : "free"}>
                      {reversed ? "Estornada" : "Concluída"}
                    </StatusBadge>
                  </div>
                  <div className="truncate text-xs text-muted">
                    {session.waiter.name}
                    {methodNames.length > 0 ? ` · ${methodNames.join(" + ")}` : ""}
                  </div>
                </div>
                <span className="tabular shrink-0 text-base font-semibold text-ink">
                  {formatBRL(session.totalAmount)}
                </span>
              </Card>
            </Link>
          );
        })}
      </div>

      <Pagination page={safePage} totalPages={totalPages} buildHref={(p) => buildHref({ page: p })} />
    </main>
  );
}
