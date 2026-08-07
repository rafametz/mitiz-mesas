// Nome alinhado a docs/design/design-system.md ("Componentes prioritários":
// StatusBadge). Antes da Fase 1 do plano de modernização isso se chamava
// `Badge` — renomeado (mesma implementação, mesma API) porque este
// componente só existe para comunicar status (mesa/pedido/impressão), não
// é um badge de propósito geral.
const TONES = {
  neutral: "bg-ink/5 text-ink",
  wine: "bg-wine/10 text-wine",
  gold: "bg-gold/15 text-gold-dark",
  muted: "bg-muted/10 text-muted",
  free: "bg-free/10 text-free-dark",
} as const;

export type StatusBadgeTone = keyof typeof TONES;

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
