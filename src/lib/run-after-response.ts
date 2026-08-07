import "server-only";
import { after } from "next/server";

// Agenda `fn` pra rodar depois da resposta já ter sido entregue ao
// navegador — a Vercel mantém a função serverless viva até `fn` terminar
// (garantia da plataforma), diferente de uma Promise solta sem `await`,
// que corre risco de ser interrompida assim que a função retorna. É o
// jeito correto de fazer trabalho secundário que não deve bloquear a
// resposta (docs/performance/optimization-plan.md, Fase 2): tempo real,
// fila de impressão, etc.
//
// `after()` só existe dentro de uma requisição real do Next.js (Server
// Action, Route Handler, Server Component) — chamado fora disso (testes
// de integração/scripts que importam a camada de aplicação direto, sem
// passar por uma requisição HTTP) ele lança "called outside a request
// scope". Nesse caso, cai para rodar `fn` direto e ESPERA terminar — sem
// isso, os testes de integração (que checam o efeito colateral, ex.: um
// PrintJob criado) ficariam instáveis por corrida contra uma Promise
// ainda em andamento. Em produção (dentro de uma requisição real),
// `after()` só agenda e retorna na hora — o `await` aqui não bloqueia a
// resposta, só espera o registro em si, que é síncrono.
export async function runAfterResponse(fn: () => void | Promise<void>): Promise<void> {
  try {
    after(fn);
  } catch {
    await fn();
  }
}
