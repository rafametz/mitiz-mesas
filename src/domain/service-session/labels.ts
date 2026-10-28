import {
  DiscountType,
  PickupOrigin,
  ServiceSessionStatus,
  type ServiceSession,
} from "@prisma/client";
import { formatTableLabel } from "@/domain/table/labels";

// Origem do pedido de retirada (tela "Nova retirada" — módulo Retiradas,
// 2026-08-14).
export const PICKUP_ORIGIN_LABELS: Record<PickupOrigin, string> = {
  COUNTER: "Balcão",
  WHATSAPP: "WhatsApp",
  PHONE: "Telefone",
};

export const SERVICE_SESSION_STATUS_LABELS: Record<ServiceSessionStatus, string> = {
  OPEN: "Aberto",
  CLOSING: "Aguardando fechamento",
  CLOSED: "Fechado",
  REOPENED: "Reaberto",
  CANCELLED: "Cancelado",
};

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  PERCENTAGE: "Percentual",
  FIXED_AMOUNT: "Valor fixo",
};

// Rótulo curto de um atendimento, independente do tipo (mesa, retirada ou
// PDV — módulo Retiradas, 2026-08-14; Módulo 17, 2026-10-28). Usado em
// qualquer lista/card que hoje só conhecia "Mesa X" e passa a receber
// itens de retirada/venda de balcão também (produção, fila de impressão,
// histórico geral).
export function formatSessionLabel(
  session: Pick<ServiceSession, "type" | "pickupNumber">,
  tableNumber?: string | null,
): string {
  if (session.type === "PICKUP") {
    return `Retirada #${session.pickupNumber ?? "?"}`;
  }
  // Correção (achado implementando o recibo do PDV, 2026-10-28): sem este
  // ramo, uma sessão PDV (sem mesa, tableNumber undefined) caía no mesmo
  // "else" de mesa e mostrava o rótulo genérico "Mesa" na fila de
  // impressão — enganoso, parecia um atendimento de mesa sem número.
  if (session.type === "PDV") {
    return "PDV";
  }
  return tableNumber ? formatTableLabel(tableNumber) : "Mesa";
}
