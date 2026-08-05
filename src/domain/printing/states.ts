import type { PrintJobStatus } from "@prisma/client";

// Máquina de estados do PrintJob (CLAUDE.md seção 7 — Impressão):
// PENDING → PROCESSING → PRINTED | FAILED; FAILED → PENDING é o
// "reprocessar" manual (docs/printing/architecture.md). CANCELLED fica
// modelado para quando o pedido/item de origem for cancelado antes de
// qualquer agente pegar o job — não implementado nesta versão (documentado
// como fora do escopo).
const PRINT_JOB_TRANSITIONS: Record<PrintJobStatus, PrintJobStatus[]> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PRINTED", "FAILED"],
  PRINTED: [],
  FAILED: ["PENDING"],
  CANCELLED: [],
};

export function canTransitionPrintJob(from: PrintJobStatus, to: PrintJobStatus): boolean {
  return PRINT_JOB_TRANSITIONS[from].includes(to);
}
