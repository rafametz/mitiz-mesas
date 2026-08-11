import { GuestStatus } from "@prisma/client";

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  ACTIVE: "Ativa",
  SETTLED: "Quitada",
};
