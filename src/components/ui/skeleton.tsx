// Bloco de carregamento — usado dentro de loading.tsx (App Router) para dar
// feedback visual durante a navegação, no formato aproximado do conteúdo
// real (evita "salto" de layout quando o dado chega). Ver
// docs/design/frontend-audit.md, item "Estados de loading, vazio e erro"
// (crítico: nenhuma rota tinha indicador de carregamento nenhum).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-control-sm bg-ink/10 ${className}`} aria-hidden />;
}
