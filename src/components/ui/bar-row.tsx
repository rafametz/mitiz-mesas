// Linha de barra horizontal simples (rótulo + barra + valor) — usado nos
// relatórios básicos (Módulo 11): sem biblioteca de gráfico nova, só
// div's com os tokens de cor da marca (mesmo racional do DonutChart:
// poucos itens por tela, não uma série grande). `colorClass` por padrão é
// `bg-gold` porque a maioria dos relatórios é sobre dinheiro
// (design-system.md: dourado é a cor de valores monetários); passa
// `bg-wine`/`bg-ink/40` pra métricas que não são R$ (contagem, minutos).
export function BarRow({
  label,
  title,
  valueLabel,
  fraction,
  colorClass = "bg-gold",
}: {
  label: React.ReactNode;
  // Texto do tooltip nativo (hover/toque prolongado) — valor completo,
  // sem abreviar (dataviz: hover layer por padrão).
  title: string;
  valueLabel: string;
  // 0-1, proporção da barra em relação ao maior valor da lista.
  fraction: number;
  colorClass?: string;
}) {
  const widthPercent = fraction <= 0 ? 0 : Math.max(fraction * 100, 2);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 truncate text-xs text-muted" title={title}>
        {label}
      </span>
      <div className="h-2 min-w-0 flex-1 rounded-full bg-line" title={title}>
        <div
          className={`h-2 rounded-full ${colorClass}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="tabular shrink-0 whitespace-nowrap text-right text-xs font-medium text-ink">
        {valueLabel}
      </span>
    </div>
  );
}
