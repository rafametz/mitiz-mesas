// Donut simples via SVG (stroke-dasharray por segmento) — sem dependência
// nova só para um gráfico de proporção. Pensado para poucos segmentos
// (status de mesa), não para séries grandes.
export function DonutChart({
  segments,
  total,
  size = 128,
  thickness = 16,
}: {
  segments: { value: number; colorClass: string; label: string }[];
  total: number;
  size?: number;
  thickness?: number;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="-rotate-90"
      role="img"
      aria-label="Distribuição de mesas por status"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={thickness}
        className="stroke-line"
      />
      {total > 0 &&
        segments
          .filter((segment) => segment.value > 0)
          .map((segment) => {
            const length = (segment.value / total) * circumference;
            const dasharray = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={thickness}
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                className={segment.colorClass}
              >
                <title>{`${segment.label}: ${segment.value}`}</title>
              </circle>
            );
            offset += length;
            return circle;
          })}
    </svg>
  );
}
