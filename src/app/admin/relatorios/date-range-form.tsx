import { Card } from "@/components/ui/card";

// Filtro de período compartilhado pelos 4 relatórios — GET simples (sem
// JS), submete pra própria URL da página com ?de=&ate=. Padrão "últimos 7
// dias" decidido em cada page.tsx (daysAgoSaoPaulo(6) até hoje).
//
// Revisão 2026-08-29 (relato do usuário): os campos não travam mais um ao
// outro (removido o `max` do HTML que prendia "De" ao "Até" atual e
// impedia ajustar as duas pontas do intervalo livremente). A validação
// "De" não pode vir depois de "Até" agora é responsabilidade de quem
// chama (`resolveReportDateRange`, `date-range.ts`) — se inválida, o
// erro aparece aqui, no contexto, com os valores digitados preservados
// (CLAUDE.md §"Formulários": nunca travar o campo, nunca perder o que a
// pessoa já tinha escolhido).
export function DateRangeForm({
  from,
  to,
  error,
}: {
  from: string;
  to: string;
  error?: string;
}) {
  return (
    <Card padding="sm">
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
      {error && (
        <p role="alert" className="mt-2 text-sm text-wine">
          {error}
        </p>
      )}
    </Card>
  );
}
