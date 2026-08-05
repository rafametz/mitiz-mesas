import "server-only";
import type { NextRequest } from "next/server";
import { findPrinterByToken } from "@/application/printing/print-queue";

// Autenticação compartilhada das rotas do agente local — token Bearer
// próprio da impressora, não a sessão do Supabase (docs/printing/
// architecture.md). Devolve a Printer autenticada ou null.
export async function authenticatePrinter(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return findPrinterByToken(token);
}
