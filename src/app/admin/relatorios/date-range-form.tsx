import { Card } from "@/components/ui/card";

// Filtro de período compartilhado pelos 4 relatórios — GET simples (sem
// JS), submete pra própria URL da página com ?de=&ate=. Padrão "últimos 7
// dias" decidido em cada page.tsx (daysAgoSaoPaulo(6) até hoje).
export function DateRangeForm({ from, to }: { from: string; to: string }) {
  return (
    <Card padding="sm">
      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted">De</span>
          <input
            type="date"
            name="de"
            defaultValue={from}
            max={to}
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
    </Card>
  );
}
