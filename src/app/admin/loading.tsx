import { Skeleton } from "@/components/ui/skeleton";

// Fallback genérico para páginas de admin sem loading.tsx próprio —
// mesmo raciocínio de (staff)/loading.tsx. A sidebar (definida no layout)
// fica visível o tempo todo; só a área de conteúdo mostra o esqueleto.
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
