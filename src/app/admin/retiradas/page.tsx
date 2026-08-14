import { AlertTriangle, Clock, ShoppingBag, Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { ACTIVE_SERVICE_SESSION_STATUSES } from "@/domain/service-session/states";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { restaurantPickupsChannel } from "@/lib/realtime/channels";
import { formatElapsed, formatTime } from "@/lib/datetime";
import { PickupCard } from "./pickup-card";
import type { PickupCardData } from "./pickup-view-model";

// Mesma alerta simples de "aberta há muito tempo" já usada em
// admin/mesas/page.tsx — limiar operacional, não regra de negócio.
const LONG_SESSION_ALERT_MINUTES = 120;

// Painel de retiradas do administrador (CLAUDE.md — módulo Retiradas,
// 2026-08-14): visão separada de Mesas, deixando claro que são dois
// fluxos de atendimento diferentes acontecendo em paralelo. Retirada não
// aparece como "mesa ocupada" em lugar nenhum e não interfere na
// disponibilidade das mesas físicas.
export default async function AdminRetiradasPage() {
  const restaurant = await getCurrentRestaurant();

  const sessions = await prisma.serviceSession.findMany({
    where: {
      restaurantId: restaurant.id,
      type: "PICKUP",
      status: { in: [...ACTIVE_SERVICE_SESSION_STATUSES] },
    },
    include: {
      waiter: true,
      orders: { include: { items: { where: { status: { not: "CANCELLED" } } } } },
    },
    orderBy: { pickupNumber: "asc" },
  });

  const pickups: PickupCardData[] = sessions.map((session) => ({
    id: session.id,
    pickupNumber: session.pickupNumber,
    customerName: session.customerName,
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    requestedAt: session.requestedAt ? session.requestedAt.toISOString() : null,
    waiterName: session.waiter.name,
    totalAmount: Number(session.totalAmount),
    paidAmount: Number(session.paidAmount),
    itemCount: session.orders.reduce((n, o) => n + o.items.length, 0),
  }));

  const closingCount = pickups.filter((p) => p.status === "CLOSING").length;
  const longOpenAlerts = pickups
    .map((p) => ({ pickup: p, minutes: Math.floor((Date.now() - new Date(p.openedAt).getTime()) / 60000) }))
    .filter((p) => p.minutes >= LONG_SESSION_ALERT_MINUTES)
    .sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresh channels={[restaurantPickupsChannel(restaurant.id)]} />
      <PageHeader
        title="Retiradas"
        subtitle="Pedidos avulsos em andamento, sem ocupar mesa."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={ShoppingBag} label="Em andamento" value={pickups.length} tone="neutral" />
        <StatCard icon={Timer} label="Aguardando fechamento" value={closingCount} tone="gold" />
        <StatCard
          icon={Clock}
          label="Com horário previsto"
          value={pickups.filter((p) => p.requestedAt).length}
          tone="wine"
        />
      </div>

      {longOpenAlerts.length > 0 && (
        <Card>
          <h2 className="font-display text-sm font-semibold text-ink">Alertas</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {longOpenAlerts.map(({ pickup, minutes }) => (
              <li key={pickup.id} className="flex gap-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-dark" />
                <div>
                  <div className="font-medium text-ink">
                    Retirada #{pickup.pickupNumber} aberta há mais de{" "}
                    {Math.floor(LONG_SESSION_ALERT_MINUTES / 60)}h
                  </div>
                  <div className="text-muted">
                    Tempo: {formatElapsed(new Date(pickup.openedAt))} ({minutes} min)
                    {pickup.requestedAt && ` · retirar às ${formatTime(new Date(pickup.requestedAt))}`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pickups.map((pickup) => (
          <PickupCard key={pickup.id} pickup={pickup} />
        ))}
        {pickups.length === 0 && (
          <EmptyState
            icon={ShoppingBag}
            title="Nenhuma retirada em andamento."
            className="col-span-full"
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "neutral" | "wine" | "gold";
}) {
  const toneClass = { neutral: "text-ink", wine: "text-wine", gold: "text-gold-dark" }[tone];
  const iconBgClass = { neutral: "bg-ink/5", wine: "bg-wine/10", gold: "bg-gold/15" }[tone];

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBgClass}`}>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </span>
      </div>
      <span className={`font-display text-2xl font-semibold ${toneClass}`}>{value}</span>
    </Card>
  );
}
