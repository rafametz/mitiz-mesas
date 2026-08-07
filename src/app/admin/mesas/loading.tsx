import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto no formato real do painel de mesas do admin (indicadores +
// grid de cards + painel lateral) — mais específico que admin/loading.tsx.
export default function AdminMesasLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-11 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
