import { Skeleton } from "@/components/ui/skeleton";

// Mesmo racional de mesas/loading.tsx — esqueleto no formato real do grid,
// evita "salto" de layout enquanto os cards de verdade carregam.
export default function RetiradasLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 pt-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
