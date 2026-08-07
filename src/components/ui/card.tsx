const CARD_PADDING = {
  sm: "p-3",
  md: "p-4",
} as const;

// Superfície padrão (card) do sistema — ver docs/design/frontend-audit.md,
// item "Cards": hoje a maioria das telas ainda reescreve
// `rounded-card border border-line bg-surface p-{3,4}` na mão em vez de
// usar este componente. `padding` cobre os dois tamanhos já usados em
// produção (a migração das telas existentes fica para uma fase seguinte,
// não muda nada aqui além de deixar o componente pronto pra receber elas).
export function Card({
  children,
  padding = "md",
  className = "",
}: {
  children: React.ReactNode;
  padding?: keyof typeof CARD_PADDING;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${CARD_PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
