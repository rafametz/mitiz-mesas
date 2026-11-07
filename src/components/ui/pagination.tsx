import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const linkClass =
  "flex h-11 items-center gap-1 rounded-control-sm border border-line px-3 text-sm font-medium text-ink hover:bg-ink/5";
const disabledClass = "flex h-11 items-center gap-1 rounded-control-sm px-3 text-sm font-medium text-muted/40";

// Navegação simples de página anterior/próxima — sem números de página
// (a lista pode ter muitas páginas; "Página X de Y" já orienta sem exigir
// pular direto para uma página arbitrária, que ninguém pediu). Só links
// (sem JS), então funciona igual em qualquer navegador e não perde o
// scroll/estado da página num re-render de cliente.
export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3">
      {hasPrev ? (
        <Link href={buildHref(page - 1)} className={linkClass}>
          <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
        </span>
      )}

      <span className="text-sm text-muted">
        Página {page} de {totalPages}
      </span>

      {hasNext ? (
        <Link href={buildHref(page + 1)} className={linkClass}>
          Próxima <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Próxima <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
