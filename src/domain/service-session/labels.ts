import { DiscountType, ServiceSessionStatus } from "@prisma/client";

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
