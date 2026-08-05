import { NextResponse, type NextRequest } from "next/server";
import { claimPendingPrintJobs } from "@/application/printing/print-queue";
import { authenticatePrinter } from "../auth";

// O agente local consulta isto em intervalos (polling — docs/printing/
// architecture.md explica por que não é WebSocket: o agente só precisa
// falar para fora, nunca abrir porta de entrada na rede do restaurante).
// Cada job devolvido já foi marcado PROCESSING (claim) — o agente confirma
// depois via PATCH /api/print-jobs/:id.
export async function GET(request: NextRequest) {
  const printer = await authenticatePrinter(request);
  if (!printer) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const jobs = await claimPendingPrintJobs(printer.id);
  return NextResponse.json({ jobs });
}
