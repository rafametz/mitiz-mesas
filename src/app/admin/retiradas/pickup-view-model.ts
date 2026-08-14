import type { ServiceSessionStatus } from "@prisma/client";

// Mesmo racional de table-view-model.ts: formato plano (sem Decimal/Date
// do Prisma) pra atravessar a fronteira server -> client component.
// Módulo Retiradas, 2026-08-14.
export type PickupCardData = {
  id: string;
  pickupNumber: number | null;
  customerName: string | null;
  status: ServiceSessionStatus;
  openedAt: string;
  requestedAt: string | null;
  waiterName: string;
  totalAmount: number;
  paidAmount: number;
  itemCount: number;
};
