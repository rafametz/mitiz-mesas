import Link from "next/link";
import { ChevronDown, DoorClosed, Plus, ReceiptText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import {
  MEAT_POINT_LABELS,
  ORDER_ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "@/domain/order/labels";
import { CANCELLABLE_ORDER_ITEM_STATUSES } from "@/domain/order/states";
import { buildConsolidatedSummary } from "@/domain/order/consolidated-summary";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/ui/fab";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryField } from "@/components/ui/summary-field";
import { ORDER_ITEM_STATUS_TONE, ORDER_STATUS_TONE } from "@/components/ui/status-tone";
import { formatTime } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { addGuest } from "./actions";
import { OpenTableForm } from "./open-table-form";
import { authorizeCancelAction, requestCancelAction } from "./pedidos/actions";
import { CancelItemForm } from "./pedidos/cancel-item-form";
import { PrintBillSummaryButton } from "../print-bill-summary-button";

// Refatoração mobile-first da tela da mesa (foco: garçom em atendimento) —
// Comanda + Pedidos + Pessoas viviam em 3 páginas/abas separadas; viram uma
// só, porque são as 3 coisas que o garçom checa o tempo todo durante o
// serviço. Histórico (raro durante atendimento ativo) saiu da navegação
// principal — ver mesa-tabs removido e IconButton de histórico em
// layout.tsx. Pagamentos (Módulo 8) tem seu próprio ícone no cabeçalho
// (mesmo layout.tsx) mais o banner abaixo quando o fechamento já começou.

export default async function MesaComandaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { table, session } = await getTableWithActiveSession(id);

  if (!session) {
    if (!hasPermission(user.permissions, PERMISSIONS.TABLES_OPEN)) {
      return <p className="text-sm text-muted">Mesa livre. Seu perfil não abre mesas.</p>;
    }

    const restaurant = await getCurrentRestaurant();
    const waiters = await prisma.user.findMany({
      where: {
        restaurantId: restaurant.id,
        active: true,
        role: { name: { in: ["WAITER", "ADMIN"] } },
      },
      orderBy: { name: "asc" },
    });

    return (
      <OpenTableForm
        tableId={table.id}
        waiters={waiters.map((w) => ({ id: w.id, name: w.name }))}
        currentUserId={user.id}
      />
    );
  }

  // Mais recentes primeiro — é o que acabou de acontecer que o garçom quer
  // ver primeiro (item pronto, pedido que acabou de sair).
  const orders = await prisma.order.findMany({
    where: { serviceSessionId: session.id },
    orderBy: { sequenceNumber: "desc" },
    include: {
      items: {
        include: { modifiers: true, guest: true, cancelledBy: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const canCreateOrder = hasPermission(user.permissions, PERMISSIONS.ORDERS_CREATE);
  const canRequestCancel = hasPermission(user.permissions, PERMISSIONS.ORDERS_CANCEL_REQUEST);
  const canAuthorizeCancel = hasPermission(user.permissions, PERMISSIONS.ORDERS_CANCEL_AUTHORIZE);
  const canAddGuest = hasPermission(user.permissions, PERMISSIONS.TABLES_OPEN);
  const canRequestClosingPermission = hasAnyPermission(user.permissions, [
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.TABLES_CLOSE,
  ]);
  // "Imprimir conferência" (CLAUDE.md seção 10) — Garçom, Caixa ou Admin;
  // Produção fica de fora (não interage com esta tela).
  const canPrintBillSummary = hasAnyPermission(user.permissions, [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ]);

  // Revisão 2026-08-10 — pagamento e fechamento são conceitos separados:
  // pagamento parcial (ou até saldo já zerado) não tira a mesa de OPEN nem
  // impede pedido novo, então o banner é só informativo nesses casos. Só
  // quando o fechamento foi solicitado de propósito (CLOSING) é que a
  // mesa entra na fase "aguardando fechamento: Fechar conta em destaque"
  // (rules/frontend-design.md, "Cards de mesa").
  const closingBannerText: string | null =
    session.status === "CLOSING"
      ? "Fechamento solicitado. Revise taxa de serviço, desconto e registre o pagamento."
      : session.paidAmount.greaterThan(0)
        ? session.balanceAmount.greaterThan(0)
          ? `Pagamento parcial: pago ${formatBRL(session.paidAmount)}, saldo restante ${formatBRL(session.balanceAmount)}.`
          : `Saldo quitado: pago ${formatBRL(session.paidAmount)}. A mesa continua aberta para novos pedidos.`
        : null;

  const addGuestWithIds = addGuest.bind(null, session.id, id);

  // Totalizador tipo nota: junta os itens de todos os pedidos ("2x Anjo",
  // "1x Panceta"...) numa única lista, em vez do garçom somar pedido por
  // pedido pra saber o consumo total ou falar o valor pro cliente (pedido
  // do usuário). Fica sempre visível — diferente do resumo financeiro e de
  // pessoas — porque é a pergunta mais frequente durante o atendimento.
  const consolidatedSummary = buildConsolidatedSummary(orders.flatMap((order) => order.items));

  return (
    <div className="flex flex-col gap-4 pb-24">
      {closingBannerText && (
        <Link
          href={`/mesas/${id}/pagamentos`}
          className="rounded-card border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold-dark"
        >
          {closingBannerText}
        </Link>
      )}

      {/* Entrada bem visível pra ir pra tela de fechamento/pagamentos —
          antes só existia o ícone pequeno de carteira no cabeçalho
          (layout.tsx), difícil de notar (feedback do usuário). Só leva pra
          lá (o caixa registra pagamentos conforme o pessoal for acertando);
          não solicita o fechamento sozinho — essa ação continua sendo
          explícita dentro da própria tela de pagamentos, com sua
          confirmação (feedback do usuário: o botão não deve "fechar a mesa
          na hora"). Some quando o fechamento já foi solicitado (CLOSING) —
          o banner acima já assume esse lugar. */}
      {session.status === "OPEN" && canRequestClosingPermission && (
        <Button
          href={`/mesas/${id}/pagamentos`}
          variant="secondary"
          className="w-full justify-center gap-2"
        >
          <DoorClosed className="h-5 w-5" />
          Fechar mesa
        </Button>
      )}

      {/* Resumo financeiro: só Subtotal fica sempre visível — os outros 5
          valores hoje ficam sempre zerados (Módulo 8 não existe ainda), então
          mostrá-los sempre era ruído, não informação. Um toque expande. */}
      <details className="group overflow-hidden rounded-card border border-line bg-surface">
        <summary
          data-testid="financeiro-toggle"
          className="flex cursor-pointer list-none items-center justify-between px-3 py-3"
        >
          <span className="text-xs text-muted">Subtotal</span>
          <span className="flex items-center gap-2">
            <span
              className="tabular font-display text-lg font-semibold text-ink"
              data-testid="resumo-subtotal"
            >
              {formatBRL(session.subtotalAmount)}
            </span>
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-3 sm:grid-cols-3">
          <SummaryField
            label="Taxa de serviço"
            value={formatBRL(session.serviceChargeAmount)}
            testId="resumo-taxa"
          />
          <SummaryField
            label="Desconto"
            value={formatBRL(session.discountAmount)}
            testId="resumo-desconto"
          />
          <SummaryField
            label="Total"
            value={formatBRL(session.totalAmount)}
            testId="resumo-total"
          />
          <SummaryField label="Pago" value={formatBRL(session.paidAmount)} testId="resumo-pago" />
          <SummaryField
            label="Saldo"
            value={formatBRL(session.balanceAmount)}
            testId="resumo-saldo"
            emphasis
          />
        </div>
      </details>

      {/* Resumo da comanda: totalizador estilo nota — todos os itens de
          todos os pedidos, agrupados e somados. Sempre visível (pedido
          explícito do usuário): é a informação que o garçom mais usa pra
          falar o consumo pro cliente, diferente do detalhe por pedido
          abaixo, que fica escondido. */}
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Resumo da comanda</h2>
          {canPrintBillSummary && consolidatedSummary.lines.length > 0 && (
            <PrintBillSummaryButton tableId={id} sessionId={session.id} />
          )}
        </div>
        {consolidatedSummary.lines.length === 0 ? (
          <p className="text-sm text-muted">Nenhum item lançado ainda.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5 text-sm">
              {consolidatedSummary.lines.map((line) => (
                <li key={line.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">
                    {line.quantity}x {line.label}
                  </span>
                  <span className="tabular shrink-0 text-muted">{formatBRL(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
              <span>Total</span>
              <span className="tabular font-display text-base">
                {formatBRL(consolidatedSummary.total)}
              </span>
            </div>
          </>
        )}
      </Card>

      {/* Pessoas: uma linha compacta, expande só quando precisa adicionar
          alguém ou ver o responsável — antes era uma página inteira própria. */}
      <details className="group overflow-hidden rounded-card border border-line bg-surface">
        <summary
          data-testid="pessoas-toggle"
          className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3 text-sm"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            {session.guests.length === 0 && (
              <span className="text-muted">Nenhum nome informado</span>
            )}
            {session.guests.map((guest) => (
              <span
                key={guest.id}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  guest.status === "SETTLED"
                    ? "bg-free/10 text-free-dark line-through decoration-1"
                    : "bg-ink/5 text-ink"
                }`}
                title={guest.status === "SETTLED" ? `${guest.name}: já quitou a parte dela` : undefined}
              >
                {guest.name}
              </span>
            ))}
            <span className="text-xs text-muted">
              ({session.guests.length}/{session.guestCount})
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          <div>
            <span className="text-xs text-muted">Responsável</span>
            <p className="text-sm text-ink">{session.responsibleName ?? "Não informado"}</p>
          </div>
          {canAddGuest && (
            <form action={addGuestWithIds} className="flex items-end gap-2">
              <TextField label="Adicionar pessoa" name="name" required maxLength={80} />
              <SubmitButton>Adicionar</SubmitButton>
            </form>
          )}
        </div>
      </details>

      {/* Pedidos — detalhe por pedido (horário, status, cancelamento). Fica
          escondido por padrão: o Resumo da comanda acima já responde "o
          que tem na mesa"; isto aqui é pra quando alguém precisa saber
          quando um pedido específico foi enviado ou cancelar um item
          (pedido do usuário — inverte a prioridade de visibilidade). */}
      <details className="group overflow-hidden rounded-card border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm">
          <span className="font-semibold text-ink">Ver todos os pedidos ({orders.length})</span>
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="flex flex-col gap-3 border-t border-line px-3 py-3">
          {orders.length === 0 && (
            <EmptyState icon={ReceiptText} title="Nenhum pedido enviado ainda." />
          )}

          {orders.map((order) => {
            // Quando todo item do pedido está no mesmo status, o badge do
            // cabeçalho já conta a história inteira — repetir o mesmo badge
            // em cada item (ex.: pedido de 1 item) era duplicação visual sem
            // informação nova (feedback do usuário sobre a refatoração da
            // tela). Só vale a pena mostrar o status por item quando eles
            // divergem (ex.: um item pronto, outro ainda em preparo).
            const itemStatuses = new Set(order.items.map((item) => item.status));
            const showItemStatus = itemStatuses.size > 1;

            return (
              <Card key={order.id}>
                <div className="mb-3 flex items-center justify-between gap-2 text-sm">
                  <span className="font-display font-semibold text-ink">
                    #{order.sequenceNumber} · {formatTime(order.createdAt)}
                  </span>
                  <StatusBadge tone={ORDER_STATUS_TONE[order.status]}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </StatusBadge>
                </div>

                <ul className="flex flex-col gap-3">
                  {order.items.map((item) => {
                    const isCancellable = CANCELLABLE_ORDER_ITEM_STATUSES.includes(item.status);
                    const requestWithIds = requestCancelAction.bind(null, item.id, id);
                    const authorizeWithIds = authorizeCancelAction.bind(null, item.id, id);
                    const itemLabel = `${item.quantity}x ${item.productNameAtOrder}`;

                    return (
                      <li
                        key={item.id}
                        className="border-t border-line pt-3 text-sm first:border-t-0 first:pt-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-ink">
                            {itemLabel}
                            {item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
                              ? ` (${MEAT_POINT_LABELS[item.meatPoint]})`
                              : ""}
                          </span>
                          {showItemStatus && (
                            <StatusBadge tone={ORDER_ITEM_STATUS_TONE[item.status]}>
                              {ORDER_ITEM_STATUS_LABELS[item.status]}
                            </StatusBadge>
                          )}
                        </div>
                        {item.guest && (
                          <div className="text-xs text-muted">Para: {item.guest.name}</div>
                        )}
                        {item.modifiers.length > 0 && (
                          <div className="text-xs text-muted">
                            + {item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}
                          </div>
                        )}
                        {item.notes && <div className="text-xs text-muted">Obs.: {item.notes}</div>}

                        {item.status === "CANCELLED" && (
                          <p className="mt-1 text-xs text-wine">
                            Cancelado: {item.cancelReason}
                            {item.cancelledBy && ` (${item.cancelledBy.name})`}
                          </p>
                        )}

                        {isCancellable && canAuthorizeCancel && (
                          <CancelItemForm
                            action={authorizeWithIds}
                            label="Cancelar"
                            pendingLabel="Cancelando..."
                            successMessage="Item cancelado."
                            itemLabel={itemLabel}
                          />
                        )}
                        {isCancellable &&
                          !canAuthorizeCancel &&
                          canRequestCancel &&
                          item.status !== "CANCELLATION_REQUESTED" && (
                            <CancelItemForm
                              action={requestWithIds}
                              label="Solicitar cancelamento"
                              pendingLabel="Enviando..."
                              successMessage="Cancelamento solicitado."
                              itemLabel={itemLabel}
                            />
                          )}
                        {item.status === "CANCELLATION_REQUESTED" && !canAuthorizeCancel && (
                          <p className="mt-1 text-xs text-gold-dark">
                            Cancelamento solicitado. Aguardando autorização.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      </details>

      {canCreateOrder && (
        <Fab href={`/mesas/${id}/pedidos/novo`} icon={Plus}>
          Novo pedido
        </Fab>
      )}
    </div>
  );
}
