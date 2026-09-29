import { RoastReservationStatus } from "@prisma/client";

export const ROAST_RESERVATION_STATUS_LABELS: Record<RoastReservationStatus, string> = {
  PENDING: "Pendente",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelada",
};
