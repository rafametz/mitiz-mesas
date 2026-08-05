const TONES = {
  neutral: "bg-ink/5 text-ink",
  wine: "bg-wine/10 text-wine",
  gold: "bg-gold/15 text-gold-dark",
  muted: "bg-muted/10 text-muted",
  free: "bg-free/10 text-free-dark",
} as const;

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
