import Link from "next/link";
import { Bell, Clock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { hasAnyPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { ACTIVE_SERVICE_SESSION_STATUSES } from "@/domain/service-session/states";
import { TABLE_STATUS_LABELS } from "@/domain/table/labels";
import { Table2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_TONE_STRIP_CLASS, TABLE_STATUS_TONE } from "@/components/ui/status-tone";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { restaurantTablesChannel } from "@/lib/realtime/channels";
import { formatElapsed } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { PrintBillSummaryButton } from "./print-bill-summary-button";
import { AtendimentoTabs } from "../atendimento-tabs";

// Visão de mesas (CLAUDE.md seção 10): grid pensado para "bater o olho" e
// já sair com a maior parte da informação — faixa de cor por status (verde
// livre / vermelho ocupada / dourado precisa de atenção), alerta de item
// pronto para retirar e indicação de pagamento parcial, tudo sem precisar
// entrar na mesa.
export default async function MesasPage() {
  const user = await requireUser();
  const restaurant = await getCurrentRestaurant();
  // "Imprimir conferência" direto do grid (pedido do usuário: não achou o
  // botão na tela da mesa, quis ele aqui) — mesma permissão do botão na
  // tela da mesa.
  const canPrintBillSummary = hasAnyPermission(user.permissions, [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ]);

  const tables = await prisma.table.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { number: "asc" },
    include: {
      serviceSessions: {
        where: { status: { in: [...ACTIVE_SERVICE_SESSION_STATUSES] } },
        include: {
          waiter: true,
          // Só o necessário para contar itens prontos aguardando entrega —
          // o alerta "pedido pronto" do CLAUDE.md seção 10.
          orders: { include: { items: { where: { status: "READY" }, select: { id: true } } } },
        },
        take: 1,
      },
    },
  });

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6">
      <RealtimeRefresh channels={[restaurantTablesChannel(restaurant.id)]} />
      <AtendimentoTabs active="mesas" />
      <PageHeader title="Mesas" subtitle={`${tables.length} cadastrada(s)`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tables.map((table) => {
          const session = table.serviceSessions[0];
          const occupied = Boolean(session);
          const readyCount = session?.orders.reduce((n, o) => n + o.items.length, 0) ?? 0;
          const partiallyPaid =
            session &&
            session.paidAmount.greaterThan(0) &&
            session.paidAmount.lessThan(session.totalAmount);
          const tone = TABLE_STATUS_TONE[table.status];

          // Card inteiro clicável (mobile-first: maior área de toque) — mas
          // precisa deixar de ser <Link> por fora pra caber o botão de
          // imprimir sem aninhar elemento interativo dentro de outro (HTML
          // inválido, foco quebrado). Solução: <Link> cobrindo o card todo
          // por baixo (absolute inset-0) como alvo de toque principal; o
          // conteúdo visual fica por cima com pointer-events desligado,
          // exceto no botão de imprimir, que reabilita o próprio clique.
          return (
            <div
              key={table.id}
              data-testid="mesa-card"
              className={`group relative flex flex-col overflow-hidden rounded-card border bg-surface transition-colors ${
                occupied ? "border-line hover:border-wine/40" : "border-line hover:border-free/40"
              }`}
            >
              <Link
                href={`/mesas/${table.id}`}
                aria-label={occupied ? `Ver mesa ${table.number}` : `Abrir mesa ${table.number}`}
                className="absolute inset-0"
              />

              <div className={`h-1.5 w-full ${STATUS_TONE_STRIP_CLASS[tone]}`} aria-hidden />

              <div className="pointer-events-none flex flex-1 flex-col gap-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-xl font-semibold text-ink">
                    {table.number}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {readyCount > 0 && (
                      <span
                        className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-dark"
                        title={`${readyCount} item(ns) pronto(s) para entrega`}
                      >
                        <Bell className="h-3 w-3" aria-hidden />
                        {readyCount}
                        <span className="sr-only"> item(ns) pronto(s) para entrega</span>
                      </span>
                    )}
                    {canPrintBillSummary && session && session.totalAmount.greaterThan(0) && (
                      <span className="pointer-events-auto">
                        <PrintBillSummaryButton
                          redirectPath={`/mesas/${table.id}`}
                          sessionId={session.id}
                          iconOnly
                        />
                      </span>
                    )}
                  </div>
                </div>

                <StatusBadge tone={tone}>{TABLE_STATUS_LABELS[table.status]}</StatusBadge>

                {session ? (
                  <>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        há {formatElapsed(session.openedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 shrink-0" />
                        {session.guestCount}
                      </span>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-2 border-t border-line pt-2">
                      <span className="truncate text-[11px] text-muted">{session.waiter.name}</span>
                      <span className="tabular shrink-0 font-display text-sm font-semibold text-ink">
                        {formatBRL(session.totalAmount)}
                      </span>
                    </div>
                    {partiallyPaid && (
                      <span className="tabular text-[11px] font-medium text-gold-dark">
                        Pago {formatBRL(session.paidAmount)} de {formatBRL(session.totalAmount)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="mt-auto text-[11px] text-muted">Toque para abrir</span>
                )}
              </div>
            </div>
          );
        })}
        {tables.length === 0 && (
          <EmptyState
            icon={Table2}
            title="Nenhuma mesa cadastrada."
            className="col-span-full"
            action={<Button href="/admin/mesas">Cadastrar mesas</Button>}
          />
        )}
      </div>
    </main>
  );
}
