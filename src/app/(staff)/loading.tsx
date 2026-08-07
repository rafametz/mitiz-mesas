import { Skeleton } from "@/components/ui/skeleton";

// Fallback genérico do App Router para qualquer página do app do garçom/
// caixa que ainda não tem loading.tsx próprio — cobre a navegação inicial
// (link direto, refresh, voltar do navegador) em rede instável (CLAUDE.md
// §3). O cabeçalho de marca e a barra inferior (definidos no layout) ficam
// visíveis o tempo todo; só a área de conteúdo mostra este esqueleto.
export default function StaffLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
