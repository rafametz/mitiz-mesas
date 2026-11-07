"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchField } from "@/components/form/search-field";

// Busca em tempo real (pedido do usuário, 2026-11-07: "conforme eu vou
// digitando, ele já vai localizando... não precisa eu digitar e clicar na
// lupa") — filtra a cada tecla, com um pequeno atraso (debounce de 300ms)
// pra não disparar uma navegação a cada letra. O filtro em si (contém em
// qualquer posição do nome/código/código de barras) já era assim desde a
// Fase 1 (`where: { contains: query, mode: "insensitive" } }` em
// page.tsx) — só a forma de disparar a busca mudou aqui, não o critério.
//
// router.replace (não push) e scroll:false: cada tecla não pode virar uma
// entrada de histórico (botão "Voltar" ficaria inútil) nem pular o scroll
// da lista — mesmo racional de SearchTermForm (vhsys). Sempre volta pra
// página 1 quando o termo muda: manter a página de uma busca anterior não
// faz sentido pra uma lista que acabou de ser refiltrada.
export function ProductSearchField({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // Só reage à digitação — reler searchParams/router/pathname a cada
    // render (sem entrar nas deps) evita disparar de novo quando a URL
    // muda por causa do nosso próprio replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <label htmlFor="q" className="text-sm font-medium text-ink">
        Buscar por nome, código ou código de barras
      </label>
      <SearchField
        id="q"
        value={value}
        onChange={setValue}
        placeholder="Ex.: picanha, AEA0001, 7898..."
        ariaLabel="Buscar por nome, código ou código de barras"
      />
    </div>
  );
}
