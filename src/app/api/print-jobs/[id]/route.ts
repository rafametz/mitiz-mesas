import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  markPrintJobFailed,
  markPrintJobPrinted,
  PrintJobError,
} from "@/application/printing/print-queue";
import { authenticatePrinter } from "../auth";

const bodySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("PRINTED") }),
  z.object({ status: z.literal("FAILED"), error: z.string().min(1).max(500) }),
]);

// O agente confirma sucesso ou falha de um job que puxou em
// GET /api/print-jobs/pending. Falha nunca derruba a fila — o job fica
// visível em /admin/impressao para reprocessar (docs/printing/
// architecture.md).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const printer = await authenticatePrinter(request);
  if (!printer) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const job =
      parsed.data.status === "PRINTED"
        ? await markPrintJobPrinted(printer.id, id)
        : await markPrintJobFailed(printer.id, id, parsed.data.error);
    return NextResponse.json({ job: { id: job.id, status: job.status } });
  } catch (error) {
    if (error instanceof PrintJobError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
