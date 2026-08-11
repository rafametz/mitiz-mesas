"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Error boundary do App Router para a área de admin — mesmo raciocínio de
// (staff)/error.tsx.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminError] erro de renderização:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-wine" strokeWidth={1.5} />
      <h1 className="font-display text-xl font-semibold text-ink">
        Não foi possível carregar esta página
      </h1>
      <p className="max-w-xs text-sm text-muted">
        Algo deu errado. Tente de novo. Se continuar acontecendo, avise um administrador.
      </p>
      <div className="mt-2 flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Tentar de novo
        </Button>
        <Button href="/admin">Ir para Admin</Button>
      </div>
    </div>
  );
}
