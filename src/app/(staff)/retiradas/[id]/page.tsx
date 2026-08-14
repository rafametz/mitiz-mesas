import NextLink from "next/link";
import { ChevronDown, DoorClosed, Plus, ReceiptText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getPickupSession } from "@/application/service-session/get-pickup-with-session";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import {
  MEAT_POINT_LABELS,
  ORDER_ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
} from "@/domain/order/labels";
import { CANCELLABLE_ORDER_ITEM_STATUSES } from "@/domain/order/states";
import { buildConsolidatedSummary } from "@/domain/order/consolidated-summary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/ui/fab";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryField } from "@/components/ui/summary-field";
import { ORDER_ITEM_STATUS_TONE, ORDER_STATUS_TONE } from "@/components/ui/status-tone";
import { formatTime } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { authorizeCancelAction, requestCancelAction } from "../../mesas/[id]/pedidos/actions";
import { CancelItemForm } from "../../mesas/[id]/pedidos/cancel-item-form";
import { PrintBillSummaryButton } from "../../mesas/print-bill-summary-button";

// Tela principal da retirada — mesma anatomia da tela de mesa
// (mesas/[id]/page.tsx: resumo financeiro, resumo da comanda, pedidos),
// sem a aba "Pessoas" (não existe em retirada). Módulo Retiradas,
// 2026-08-14.
export default async function RetiradaComandaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const session = await getPickupSession(id);

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
  const canRequestClosingPermission = hasAnyPermission(user.permissions, [
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.TABLES_CLOSE,
  ]);
  const canPrintBillSummary = hasAnyPermission(user.permissions, [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ]);

  const closingBannerText: string | null =
    session.status === "CLOSING"
      ? "Fechamento solicitado. Revise o pagamento antes de finalizar."
      : session.paidAmount.greaterThan(0)
        ? session.balanceAmount.greaterThan(0)
          ? `Pagamento parcial: pago ${formatBRL(session.paidAmount)}, saldo restante ${formatBRL(session.balanceAmount)}.`
          : `Saldo quitado: pago ${formatBRL(session.paidAmount)}. A retirada continua aberta para novos itens.`
        : null;

  const consolidatedSummary = buildConsolidatedSummary(orders.flatMap((order) => order.items));

  return (
    <div className="flex flex-col gap-4 pb-24">
      {closingBannerText && (
        <NextLink
          href={`/retiradas/${id}/pagamentos`}
          className="rounded-card border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold-dark"
        >
          {closingBannerText}
        </NextLink>
      )}

      {session.status === "OPEN" && canRequestClosingPermission && (
        <Button
          href={`/retiradas/${id}/pagamentos`}
          variant="secondary"
          className="w-full justify-center gap-2"
        >
          <DoorClosed className="h-5 w-5" />
          Fechar retirada
        </Button>
      )}

      {session.pickupNote && (
        <Card padding="sm" className="text-sm">
          <span className="text-xs font-semibold text-muted">Observação</span>
          <p className="text-ink">{session.pickupNote}</p>
        </Card>
      )}

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
          <SummaryField label="Total" value={formatBRL(session.totalAmount)} testId="resumo-total" />
          <SummaryField label="Pago" value={formatBRL(session.paidAmount)} testId="resumo-pago" />
          <SummaryField
            label="Saldo"
            value={formatBRL(session.balanceAmount)}
            testId="resumo-saldo"
            emphasis
          />
        </div>
      </details>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Resumo da comanda</h2>
          {canPrintBillSummary && consolidatedSummary.lines.length > 0 && (
            <PrintBillSummaryButton redirectPath={`/retiradas/${id}`} sessionId={session.id} />
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
                    const requestWithIds = requestCancelAction.bind(
                      null,
                      item.id,
                      `/retiradas/${id}`,
                    );
                    const authorizeWithIds = authorizeCancelAction.bind(
                      null,
                      item.id,
                      `/retiradas/${id}`,
                    );
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
        <Fab href={`/retiradas/${id}/pedidos/novo`} icon={Plus}>
          Novo pedido
        </Fab>
      )}
    </div>
  );
}
