import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase para uso em Server Components, Route Handlers e Server
// Actions. Usa a chave "anon" + os cookies de sessão do usuário — o acesso
// aos dados continua sujeito ao RLS de cada tabela.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component sem permissão de
            // escrever cookies — inofensivo se houver um middleware
            // renovando a sessão (será configurado no Módulo 1).
          }
        },
      },
    },
  );
}
