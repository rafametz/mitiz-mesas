"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

// Reenviar a busca (ajustar o termo) precisa ficar no lugar na tela — se
// fosse um <form method="get"> comum, o navegador faria uma navegação de
// verdade e voltaria o scroll pro topo da listagem (relato do usuário
// 2026-08-29: perder o lugar numa lista grande de produtos toda vez que
// buscava ou vinculava). `router.push(..., { scroll: false })` evita
// isso — só os links "Buscar vínculo"/"Fechar busca" (page.tsx) e este
// formulário mexem no scroll; os outros parâmetros da URL (ex.:
// semVinculo) são preservados.
export function SearchTermForm({ productId, initialTerm }: { productId: string; initialTerm: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [term, setTerm] = useState(initialTerm);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("buscar", productId);
    if (term.trim()) {
      params.set("termo", term);
    } else {
      params.delete("termo");
    }
    router.push(`/admin/integracoes/vhsys?${params.toString()}`, { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-1 min-w-[180px] flex-col gap-1 text-sm">
        <span className="text-xs text-muted">Nome (ou parte do nome) na VHSYS</span>
        <input
          type="text"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          className="h-10 rounded-control-sm border border-line bg-surface px-3 text-sm text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/20"
        />
      </label>
      <button
        type="submit"
        className="flex h-10 items-center gap-1.5 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Buscar
      </button>
    </form>
  );
}
