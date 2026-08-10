// Extraído de mesas/[id]/page.tsx (Módulo 8 Fase B) — mesmo "tile" de
// valor financeiro usado ali (resumo da comanda) agora reutilizado também
// em mesas/[id]/pagamentos/page.tsx, em vez de duplicar a marcação.
export function SummaryField({
  label,
  value,
  testId,
  emphasis = false,
}: {
  label: string;
  value: string;
  testId?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-control-sm border p-2 ${
        emphasis ? "border-wine/25 bg-wine/[0.04]" : "border-line bg-bg/60"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`tabular font-display text-sm font-semibold ${emphasis ? "text-wine" : "text-ink"}`}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}
