import Link from "next/link";
import { Bell, Pencil, Users } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATUS_TONE_STRIP_CLASS, TABLE_STATUS_TONE } from "@/components/ui/status-tone";
import { TABLE_STATUS_LABELS } from "@/domain/table/labels";
import { formatBRL } from "@/lib/money";
import { canOpenTable } from "@/domain/table/states";
import { ElapsedClock } from "./elapsed-clock";
import type { TableCardData } from "./table-view-model";

// Card de mesa do painel do administrador — versão mais densa que a do
// garçom (src/app/(staff)/mesas/page.tsx): capacidade, consumo e cronômetro
// ao vivo, pensados para quem está gerenciando o salão à distância, não
// segurando o celular na mão (CLAUDE.md seção 5 — Administrador/Caixa
// "visualizar todas as mesas e alterações em tempo real").
export function TableCard({ table }: { table: TableCardData }) {
  const { session } = table;
  const tone = TABLE_STATUS_TONE[table.status];
  const partiallyPaid =
    session && session.paidAmount > 0 && session.paidAmount < session.totalAmount;

  const action = session
    ? { label: "Ver detalhes", href: `/mesas/${table.id}`, primary: false }
    : canOpenTable(table.status)
      ? { label: "Abrir mesa", href: `/mesas/${table.id}`, primary: true }
      : { label: "Editar", href: `/admin/mesas/${table.id}/editar`, primary: false };

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className={`h-1.5 w-full ${STATUS_TONE_STRIP_CLASS[tone]}`} aria-hidden />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge tone={tone}>{TABLE_STATUS_LABELS[table.status]}</StatusBadge>
          <div className="flex items-center gap-1.5">
            {session && session.readyCount > 0 && (
              <span
                className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-dark"
                title={`${session.readyCount} item(ns) pronto(s) para entrega`}
              >
                <Bell className="h-3 w-3" aria-hidden />
                {session.readyCount}
                <span className="sr-only"> item(ns) pronto(s) para entrega</span>
              </span>
            )}
            <IconButton
              href={`/admin/mesas/${table.id}/editar`}
              label="Editar mesa"
              icon={Pencil}
            />
          </div>
        </div>

        <div>
          <span className="font-display text-2xl font-semibold text-ink">{table.number}</span>
          {table.capacity && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted">
              <Users className="h-3.5 w-3.5" />
              até {table.capacity}
            </span>
          )}
        </div>

        {session ? (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
            <div>
              <div className="text-muted">Consumo</div>
              <div className="tabular font-semibold text-ink">{formatBRL(session.totalAmount)}</div>
            </div>
            <div>
              <div className="text-muted">Tempo aberto</div>
              <div className="font-semibold text-ink">
                <ElapsedClock since={session.openedAt} />
              </div>
            </div>
            <div className="col-span-2 text-muted">
              {session.guestCount} pessoa(s) · {session.waiterName}
            </div>
            {partiallyPaid && (
              <div className="tabular col-span-2 text-gold-dark">
                Pago {formatBRL(session.paidAmount)} de {formatBRL(session.totalAmount)}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted">
            {table.capacity ? `Capacidade: ${table.capacity} pessoa(s)` : "Sem atendimento ativo"}
          </div>
        )}

        <Link
          href={action.href}
          className={`mt-auto flex items-center justify-center rounded-lg py-2 text-sm font-semibold transition-colors ${
            action.primary
              ? "bg-free text-white hover:bg-free-dark"
              : "border border-line text-ink hover:border-ink/30"
          }`}
        >
          {action.label}
        </Link>
      </div>
    </div>
  );
}
