import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderItemStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { MEAT_POINT_LABELS } from "@/domain/order/labels";
import { formatSessionLabel } from "@/domain/service-session/labels";
import { Card, PageHeader } from "@/components/ui/card";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { sectorChannel } from "@/lib/realtime/channels";
import { formatElapsed } from "@/lib/datetime";
import { advanceItemStatusAction } from "./actions";
import { AdvanceItemForm } from "./advance-item-form";

const itemInclude = {
  order: { include: { serviceSession: { include: { table: true } } } },
  guest: true,
  modifiers: true,
} satisfies Prisma.OrderItemInclude;

type ProductionItem = Prisma.OrderItemGetPayload<{ include: typeof itemInclude }>;

// Colunas fixas da esteira (CLAUDE.md seção 10 — "Novos; Em preparo;
// Prontos; Entregues"). Item não tem status "recebido" próprio (só o
// pedido tem — ver deriveOrderProgressStatus); "Novos" = SENT cobre isso.
const COLUMNS: {
  status: OrderItemStatus;
  title: string;
  nextStatus?: OrderItemStatus;
  actionLabel?: string;
  pendingLabel?: string;
}[] = [
  {
    status: "SENT",
    title: "Novos",
    nextStatus: "IN_PREPARATION",
    actionLabel: "Iniciar preparo",
    pendingLabel: "Iniciando...",
  },
  {
    status: "IN_PREPARATION",
    title: "Em preparo",
    nextStatus: "READY",
    actionLabel: "Marcar pronto",
    pendingLabel: "Marcando...",
  },
  {
    status: "READY",
    title: "Prontos",
    nextStatus: "DELIVERED",
    actionLabel: "Marcar entregue",
    pendingLabel: "Entregando...",
  },
  { status: "DELIVERED", title: "Entregues" },
];

export default async function ProducaoSectorPage({
  params,
}: {
  params: Promise<{ sectorId: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTION_STATUS_UPDATE);
  const { sectorId } = await params;
  const restaurant = await getCurrentRestaurant();

  const [sector, sectors, activeItems, recentDelivered] = await Promise.all([
    prisma.productionSector.findFirst({ where: { id: sectorId, restaurantId: restaurant.id } }),
    prisma.productionSector.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.orderItem.findMany({
      where: { sectorId, status: { in: ["SENT", "IN_PREPARATION", "READY"] } },
      include: itemInclude,
      orderBy: { createdAt: "asc" },
    }),
    // Teto de segurança: "Entregues" é histórico recente, não a fila —
    // sem isso a coluna cresceria sem fim ao longo de um turno.
    prisma.orderItem.findMany({
      where: { sectorId, status: "DELIVERED" },
      include: itemInclude,
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  if (!sector) notFound();

  const itemsByStatus: Record<OrderItemStatus, ProductionItem[]> = {
    DRAFT: [],
    SENT: [],
    IN_PREPARATION: [],
    READY: [],
    DELIVERED: recentDelivered,
    CANCELLATION_REQUESTED: [],
    CANCELLED: [],
  };
  for (const item of activeItems) itemsByStatus[item.status].push(item);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pt-6">
      <RealtimeRefresh channels={[sectorChannel(sectorId)]} />
      <PageHeader title="Produção" subtitle={sector.name} />

      {sectors.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sectors.map((s) => (
            <Link
              key={s.id}
              href={`/producao/${s.id}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                s.id === sectorId
                  ? "bg-wine text-bg"
                  : "border border-line bg-surface text-ink hover:border-ink/30"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const items = itemsByStatus[column.status];
          return (
            <div key={column.status} className="flex w-72 shrink-0 flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-display text-sm font-semibold text-ink">{column.title}</h2>
                <span className="text-xs text-muted">{items.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <Card key={item.id} padding="sm" className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-semibold text-ink">
                        {formatSessionLabel(
                          item.order.serviceSession,
                          item.order.serviceSession.table?.number,
                        )}
                      </span>
                      <span className="text-xs text-muted">há {formatElapsed(item.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-ink">
                      {item.quantity}x {item.productNameAtOrder}
                      {item.meatPoint && item.meatPoint !== "NAO_SE_APLICA"
                        ? ` (${MEAT_POINT_LABELS[item.meatPoint]})`
                        : ""}
                    </div>
                    {item.guest && (
                      <div className="text-xs text-muted">Para: {item.guest.name}</div>
                    )}
                    {item.modifiers.length > 0 && (
                      <div className="text-xs text-muted">
                        + {item.modifiers.map((m) => m.modifierNameAtOrder).join(", ")}
                      </div>
                    )}
                    {item.notes && (
                      <div className="mt-1 rounded bg-gold/10 px-2 py-1 text-xs font-medium text-gold-dark">
                        Obs.: {item.notes}
                      </div>
                    )}

                    {column.nextStatus && column.actionLabel && column.pendingLabel && (
                      <AdvanceItemForm
                        action={advanceItemStatusAction.bind(
                          null,
                          item.id,
                          sectorId,
                          column.nextStatus,
                        )}
                        label={column.actionLabel}
                        pendingLabel={column.pendingLabel}
                      />
                    )}
                  </Card>
                ))}
                {items.length === 0 && <p className="px-1 text-xs text-muted">Nenhum item aqui.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
