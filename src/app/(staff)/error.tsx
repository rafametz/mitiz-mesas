"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Error boundary do App Router para o app do garçom/caixa — sem isso,
// qualquer falha de renderização (ex.: banco fora do ar no meio de uma
// consulta) cai na tela padrão do Next.js, sem a identidade do sistema
// nem uma ação de recuperação (docs/design/frontend-audit.md, item
// "Estados de loading, vazio e erro", crítico).
export default function StaffError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StaffError] erro de renderização:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="h-10 w-10 text-wine" strokeWidth={1.5} />
      <h1 className="font-display text-xl font-semibold text-ink">
        Não foi possível carregar esta página
      </h1>
      <p className="max-w-xs text-sm text-muted">
        Algo deu errado. Tente de novo — se continuar acontecendo, avise um administrador.
      </p>
      <div className="mt-2 flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Tentar de novo
        </Button>
        <Button href="/mesas">Ir para Mesas</Button>
      </div>
    </div>
  );
}
