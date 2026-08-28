import Link from "next/link";
import type { VhsysProduct } from "@/lib/vhsys/client";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/form/submit-button";
import { formatBRL } from "@/lib/money";
import { quickLinkProductAction } from "./actions";
import { SearchTermForm } from "./search-term-form";

// Painel de busca de vínculo por linha (pedido do usuário 2026-08-29): em
// vez de copiar o id_produto de uma busca genérica e colar no campo
// manual, cada produto tem um botão "Buscar vínculo" que já dispara a
// busca com o próprio nome do produto — o operador só compara os
// resultados e clica "Vincular". `termo` chega pré-preenchido com o nome
// do produto, mas é editável (a nomenclatura da VHSYS costuma ser bem
// diferente/abreviada, então às vezes é preciso ajustar).
export function MatchPanel({
  productId,
  productName,
  term,
  results,
  error,
  configured,
  closeHref,
}: {
  productId: string;
  productName: string;
  term: string;
  results: VhsysProduct[];
  error: string | null;
  configured: boolean;
  closeHref: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-ink/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Buscar vínculo · {productName}
        </span>
        <Link href={closeHref} scroll={false} className="text-xs font-medium text-wine underline">
          Fechar
        </Link>
      </div>

      <SearchTermForm productId={productId} initialTerm={term} />

      {!configured ? (
        <p className="text-sm text-muted">Configure as credenciais da VHSYS para buscar produtos.</p>
      ) : error ? (
        <p className="text-sm text-wine">{error}</p>
      ) : results.length === 0 ? (
        <EmptyState title={`Nenhum produto encontrado na VHSYS para "${term}".`} />
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {results.map((match) => (
            <li
              key={match.idProduto}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control-sm bg-surface px-3 py-2"
            >
              <span className="text-ink">{match.descProduto}</span>
              <span className="flex items-center gap-3 text-xs text-muted">
                {match.valorProduto && <span>{formatBRL(match.valorProduto)}</span>}
                <span className="tabular font-semibold text-ink">id_produto: {match.idProduto}</span>
                <form action={quickLinkProductAction.bind(null, productId, match.idProduto)}>
                  <SubmitButton variant="secondary" pendingLabel="Vinculando...">
                    Vincular
                  </SubmitButton>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
