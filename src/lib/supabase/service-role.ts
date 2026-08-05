import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora RLS. Uso restrito a rotinas de
// servidor que precisam operar fora do contexto de um usuário autenticado
// (ex.: jobs administrativos). O import de "server-only" garante que este
// arquivo nunca seja incluído em um bundle enviado ao navegador.
//
// Prefira sempre src/lib/supabase/server.ts (cliente com sessão do usuário
// + RLS) — este arquivo é a exceção, não a regra.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
