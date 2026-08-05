import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Atualiza (refresh) a sessão do Supabase a cada requisição e devolve o
// usuário autenticado, se houver. Chamado pelo middleware raiz
// (src/middleware.ts) — é aqui que os cookies de sessão são renovados antes
// de expirar, então precisa rodar em toda rota protegida.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() (não getSession()) valida o token direto com o Supabase Auth —
  // é o que a documentação recomenda em código de servidor, pois getSession()
  // só lê o cookie sem revalidar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
