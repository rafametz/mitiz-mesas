import Link from "next/link";
import { SearchX } from "lucide-react";

// 404 global do App Router — antes disso, rota inexistente (ou notFound()
// chamado numa page) caía na tela padrão do Next.js, sem a identidade do
// sistema. Mesmo padrão visual de src/app/sem-permissao/page.tsx (ícone +
// título + texto curto + link de volta), de propósito — as duas telas são
// a mesma família de "não dá pra continuar por aqui".
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-8 text-center">
      <SearchX className="h-10 w-10 text-wine" strokeWidth={1.5} />
      <h1 className="font-display text-xl font-semibold text-ink">Página não encontrada</h1>
      <p className="max-w-xs text-sm text-muted">
        O endereço não existe, ou o que você procura não está mais disponível.
      </p>
      <Link href="/mesas" className="mt-2 text-sm font-medium text-wine underline">
        Voltar para Mesas
      </Link>
    </main>
  );
}
