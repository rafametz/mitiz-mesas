import "server-only";
import type { ServiceSession } from "@prisma/client";
import { formatTime } from "@/lib/datetime";
import type { TicketPickupHeader } from "@/domain/printing/ticket";

export type TicketHeaderFields = { tableNumber: string | null; pickup: TicketPickupHeader | null };

// Monta o par tableNumber/pickup usado em todo impresso (ticket.ts,
// bill-summary.ts) — exatamente um dos dois, conforme session.type
// (módulo Retiradas, 2026-08-14). Centralizado porque
// createPrintJobsForOrder, cancelOrderItem e createBillSummaryPrintJob
// precisam do mesmo par a partir da mesma ServiceSession.
export function buildTicketHeader(
  session: Pick<
    ServiceSession,
    "type" | "customerName" | "customerPhone" | "requestedAt" | "pickupNumber"
  >,
  tableNumber: string | null,
): TicketHeaderFields {
  if (session.type === "PICKUP") {
    return {
      tableNumber: null,
      pickup: {
        // Não-nulos de verdade quando type = PICKUP (regra de negócio,
        // não expressável no tipo do Prisma) — createPickup sempre grava
        // os três juntos.
        number: session.pickupNumber ?? 0,
        customerName: session.customerName ?? "",
        customerPhone: session.customerPhone,
        requestedTimeLabel: session.requestedAt ? formatTime(session.requestedAt) : null,
      },
    };
  }
  return { tableNumber, pickup: null };
}
