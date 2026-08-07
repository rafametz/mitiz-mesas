import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto no formato real do grid de mesas (2 colunas, cards com faixa
// de status) — mais específico que (staff)/loading.tsx, evita o "salto"
// de layout quando os cards de verdade chegam.
export default function MesasLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
