// Estado vazio padrão — endereça o achado de auditoria "estado vazio é
// uma string repetida em cada lista, nunca um componente"
// (docs/design/frontend-audit.md, item "Cards"/"Consistência"). Ícone
// opcional (contexto visual rápido), texto sempre presente, ação opcional
// (ex.: link para cadastrar o primeiro registro) — "estados vazios devem
// orientar a próxima ação" (CLAUDE.md §11).
export function EmptyState({
  icon: Icon,
  title,
  action,
  className = "",
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-4 py-8 text-center ${className}`}
    >
      {Icon && <Icon className="h-6 w-6 text-muted" strokeWidth={1.5} />}
      <p className="text-sm text-muted">{title}</p>
      {action}
    </div>
  );
}
