import "server-only";
import type { NextRequest } from "next/server";
import { findPrinterByToken } from "@/application/printing/print-queue";
import { prisma } from "@/lib/prisma";
import { runAfterResponse } from "@/lib/run-after-response";

// Autenticação compartilhada das rotas do agente local — token Bearer
// próprio da impressora, não a sessão do Supabase (docs/printing/
// architecture.md). Devolve a Printer autenticada ou null.
export async function authenticatePrinter(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  const printer = await findPrinterByToken(token);
  if (!printer) return null;

  // Heartbeat: toda chamada autenticada do agente (puxar fila ou confirmar
  // impressão) atualiza lastSeenAt — é o que a tela /impressao usa pra
  // mostrar se o agente está ativo ou parado (src/domain/printing/
  // agent-status.ts). Não é crítico pra resposta ao agente, então não
  // bloqueia (mesmo racional de runAfterResponse já usado no pedido).
  await runAfterResponse(async () => {
    await prisma.printer.update({ where: { id: printer.id }, data: { lastSeenAt: new Date() } });
  });

  return printer;
}
