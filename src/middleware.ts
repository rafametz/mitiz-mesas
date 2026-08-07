import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Proteção de rota (CLAUDE.md seção 5/25): toda rota exige sessão válida,
// exceto as listadas aqui. A restrição por perfil/permissão específica
// (Administrador, Caixa, Garçom, Produção) é aplicada rota a rota conforme
// as telas de cada módulo forem criadas (docs/backlog.md) — este
// middleware garante só o requisito comum a todas: estar autenticado.
const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // `api/` fica de fora: uma rota de API nunca deveria responder a um
  // cliente sem sessão de navegador com um redirect HTML para /login —
  // isso quebra qualquer chamador que não seja um browser (ex.: o agente
  // local de impressão do Módulo 7, autenticado por token Bearer próprio,
  // não por cookie do Supabase). Cada rota de API é responsável pela
  // própria autenticação.
  //
  // manifest.webmanifest e sw.js também ficam de fora, pelo mesmo motivo:
  // o navegador busca os dois sem cookie de sessão nenhum pra decidir se
  // oferece "Instalar app" — um redirect HTML pro login ali quebra a
  // instalação (o manifesto vira HTML em vez de JSON) e impede o Service
  // Worker de registrar (a especificação recusa registro se a resposta do
  // próprio arquivo do SW for um redirect).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
