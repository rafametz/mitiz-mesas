import { ServiceSessionStatus } from "@prisma/client";

export const SERVICE_SESSION_STATUS_LABELS: Record<ServiceSessionStatus, string> = {
  OPEN: "Aberto",
  WAITING_CLOSING: "Aguardando fechamento",
  PARTIALLY_PAID: "Pagamento parcial",
  PAID: "Pago",
  CLOSED: "Fechado",
  REOPENED: "Reaberto",
  CANCELLED: "Cancelado",
};
