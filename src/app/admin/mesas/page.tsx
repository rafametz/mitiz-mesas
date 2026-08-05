import Link from "next/link";
import { AlertTriangle, CircleDot, DoorOpen, Table2, Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { ACTIVE_SERVICE_SESSION_STATUSES } from "@/domain/service-session/states";
import { PageHeader } from "@/components/ui/card";
import { DonutChart } from "@/components/ui/donut-chart";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { restaurantTablesChannel } from "@/lib/realtime/channels";
import { formatElapsed } from "@/lib/datetime";
import { TableCard } from "./table-card";
import { statusBucket, type TableCardData } from "./table-view-model";

// Mesa aberta há mais desse tempo entra no painel de alertas — limiar
// simples (não é regra de negócio do CLAUDE.md, é só um alerta operacional
// de tela; ajustar aqui não muda nenhum estado gravado).
const LONG_SESSION_ALERT_MINUTES = 120;

export default async function AdminMesasPage() {
  const restaurant = await getCurrentRestaurant();

  const tables = await prisma.table.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { number: "asc" },
    include: {
      serviceSessions: {
        where: { status: { in: [...ACTIVE_SERVICE_SESSION_STATUSES] } },
        include: {
          waiter: true,
          orders: { include: { items: { where: { status: "READY" }, select: { id: true } } } },
        },
        take: 1,
      },
    },
  });

  const rows: TableCardData[] = tables.map((table) => {
    const session = table.serviceSessions[0];
    return {
      id: table.id,
      number: table.number,
      capacity: table.capacity,
      status: table.status,
      session: session
        ? {
            openedAt: session.openedAt.toISOString(),
            guestCount: session.guestCount,
            waiterName: session.waiter.name,
            totalAmount: Number(session.totalAmount),
            paidAmount: Number(session.paidAmount),
            readyCount: session.orders.reduce((n, o) => n + o.items.length, 0),
          }
        : null,
    };
  });

  const total = rows.length;
  const counts = { free: 0, occupied: 0, closing: 0, other: 0 };
  for (const row of rows) counts[statusBucket(row.status)] += 1;
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1).replace(".0", "")}%` : "—");

  const longOpenAlerts = rows
    .filter((r) => r.session)
    .map((r) => ({ row: r, minutes: Math.floor((Date.now() - new Date(r.session!.openedAt).getTime()) / 60000) }))
    .filter((r) => r.minutes >= LONG_SESSION_ALERT_MINUTES)
    .sort((a, b) => b.minutes - a.minutes);

  const closingAlerts = rows.filter((r) => statusBucket(r.status) === "closing");

  return (
    <div className="flex flex-col gap-6">
      <RealtimeRefresh channels={[restaurantTablesChannel(restaurant.id)]} />
      <PageHeader
        title="Mesas"
        subtitle="Visualize e gerencie todas as mesas do salão."
        action={
          <Link
            href="/admin/mesas/nova"
            className="flex items-center gap-1.5 rounded-lg bg-wine px-4 py-2 text-sm font-semibold text-white hover:bg-wine-dark"
          >
            + Nova mesa
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Table2} label="Total de mesas" value={total} hint="Cadastradas" tone="neutral" />
        <StatCard icon={DoorOpen} label="Livres" value={counts.free} hint={pct(counts.free)} tone="free" />
        <StatCard
          icon={CircleDot}
          label="Ocupadas"
          value={counts.occupied}
          hint={pct(counts.occupied)}
          tone="wine"
        />
        <StatCard
          icon={Timer}
          label="Fechando"
          value={counts.closing}
          hint={pct(counts.closing)}
          tone="gold"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <TableCard key={row.id} table={row} />
          ))}
          {rows.length === 0 && (
            <p className="col-span-full text-sm text-muted">
              Nenhuma mesa cadastrada.{" "}
              <Link href="/admin/mesas/nova" className="font-medium text-wine underline">
                Cadastrar a primeira
              </Link>
              .
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink">Resumo do salão</h2>
            <div className="mt-3 flex items-center justify-center">
              <DonutChart
                total={total}
                segments={[
                  { value: counts.free, colorClass: "stroke-free", label: "Livres" },
                  { value: counts.occupied, colorClass: "stroke-wine", label: "Ocupadas" },
                  { value: counts.closing, colorClass: "stroke-gold", label: "Fechando" },
                  { value: counts.other, colorClass: "stroke-muted", label: "Outras" },
                ]}
              />
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-xs">
              <LegendRow colorClass="bg-free" label="Livres" value={counts.free} />
              <LegendRow colorClass="bg-wine" label="Ocupadas" value={counts.occupied} />
              <LegendRow colorClass="bg-gold" label="Fechando" value={counts.closing} />
              {counts.other > 0 && <LegendRow colorClass="bg-muted" label="Outras" value={counts.other} />}
              <li className="mt-1 flex items-center justify-between border-t border-line pt-1.5 font-semibold text-ink">
                <span>Total</span>
                <span>{total}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink">Alertas</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {closingAlerts.map(({ id, number }) => (
                <AlertRow
                  key={`closing-${id}`}
                  title={`Mesa ${number} aguardando fechamento`}
                  detail="Verifique e finalize o fechamento."
                />
              ))}
              {longOpenAlerts.map(({ row, minutes }) => (
                <AlertRow
                  key={`long-${row.id}`}
                  title={`Mesa ${row.number} aberta há mais de ${Math.floor(LONG_SESSION_ALERT_MINUTES / 60)}h`}
                  detail={`Tempo: ${formatElapsed(new Date(row.session!.openedAt))} (${minutes} min)`}
                />
              ))}
              {closingAlerts.length === 0 && longOpenAlerts.length === 0 && (
                <li className="text-xs text-muted">Nenhum alerta no momento.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
  tone: "neutral" | "free" | "wine" | "gold";
}) {
  const toneClass = {
    neutral: "text-ink",
    free: "text-free-dark",
    wine: "text-wine",
    gold: "text-gold-dark",
  }[tone];
  const iconBgClass = {
    neutral: "bg-ink/5",
    free: "bg-free/10",
    wine: "bg-wine/10",
    gold: "bg-gold/15",
  }[tone];

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBgClass}`}>
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </span>
      </div>
      <span className={`font-display text-2xl font-semibold ${toneClass}`}>{value}</span>
      <span className="text-xs text-muted">{hint}</span>
    </div>
  );
}

function LegendRow({ colorClass, label, value }: { colorClass: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} aria-hidden />
        {label}
      </span>
      <span className="font-medium text-ink">{value}</span>
    </li>
  );
}

function AlertRow({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="flex gap-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-dark" />
      <div>
        <div className="font-medium text-ink">{title}</div>
        <div className="text-muted">{detail}</div>
      </div>
    </li>
  );
}
