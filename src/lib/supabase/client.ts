import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para uso em componentes client-side ("use client").
// Usa a chave "anon" — segura para expor no navegador (o que protege os
// dados é o RLS habilitado em cada tabela, não o sigilo desta chave; ver
// docs/architecture/decisions/0002-adocao-supabase.md).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
