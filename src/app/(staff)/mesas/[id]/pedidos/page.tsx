import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { MEAT_POINT_LABELS, ORDER_ITEM_STATUS_LABELS } from "@/domain/order/labels";
import { CANCELLABLE_ORDER_ITEM_STATUSES } from "@/domain/order/states";
import { Badge } from "@/components/ui/badge";
import { ORDER_ITEM_STATUS_TONE } from "@/components/ui/status-tone";
import { formatDateTime } from "@/lib/datetime";
import { formatBRL } from "@/lib/money";
import { authorizeCancelAction, requestCancelAction } from "./actions";
import { CancelItemForm } from "./cancel-item-form";

export default async function PedidosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);

  const orders = await prisma.order.findMany({
    where: { serviceSessionId: session.id },
    orderBy: { sequenceNumber: "asc" },
    include: {
      waiter: true,
      items: {
        include: { modifiers: true, guest: true, cancelledBy: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const canCreate = hasPermission(user.permissions, PERMISSIONS.ORDERS_CREATE);
  const canRequestCancel = hasPermission(user.permissions, PERMISSIONS.ORDERS_CANCEL_REQUEST);
  const canAuthorizeCancel = hasPermission(user.permissions, PERMISSIONS.ORDERS_CANCEL_AUTHORIZE);

  return (
    <div className="flex flex-col gap-6 py-4">
      {canCreate && (
        <Link
          href={`/mesas/${id}/pedidos/novo`}
          className="self-start rounded-lg bg-wine px-4 py-2.5 text-sm font-semibold text-bg hover:bg-wine-dark"
        >
          + Novo pedido
        </Link>
      )}

      {orders.length === 0 && <p className="text-sm text-muted">Nenhum pedido enviado ainda.</p>}

      {orders.map((order) => (
        <div key={order.id} className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-display font-semibold text-ink">
              Pedido #{order.sequenceNumber}
            </span>
            <span className="text-muted">
              {formatDateTime(order.createdAt)} · {order.waiter.name}
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            {order.items.map((item) => {
              const isCancellable = CANCELLABLE_ORDER_ITEM_STATUSES.includes(item.status);
              const requestWithIds = requestCancelAction.bind(null, item.id, id);
              const authorizeWithIds = authorizeCancelAction.bind(null, item.id, id);

              return (
                <li
                  key={item.id}
                  className="border-t border-line pt-3 text-sm first:border-t-0 first:pt-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink">
                      {item.quantity}x {item.productNameAtOrder}
                      {item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
                        ? ` (${MEAT_POINT_LABELS[item.meatPoint]})`
                        : ""}
                    </span>
                    <Badge tone={ORDER_ITEM_STATUS_TONE[item.status]}>
                      {ORDER_ITEM_STATUS_LABELS[item.status]}
                    </Badge>
                  </div>
                  {item.guest && <div className="text-xs text-muted">Para: {item.guest.name}</div>}
                  {item.modifiers.length > 0 && (
                    <div className="text-xs text-muted">
                      + {item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}
                    </div>
                  )}
                  {item.notes && <div className="text-xs text-muted">Obs.: {item.notes}</div>}
                  <div className="tabular text-xs text-muted">{formatBRL(item.unitPrice)} cada</div>

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
                      />
                    )}
                  {item.status === "CANCELLATION_REQUESTED" && !canAuthorizeCancel && (
                    <p className="mt-1 text-xs text-gold-dark">
                      Cancelamento solicitado — aguardando autorização.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
