import type { OrderItemStatus, PrintJobStatus, ServiceSessionStatus, TableStatus } from "@prisma/client";

// Mapeamento de status -> tom visual do Badge. Fica na camada de UI de
// propósito (não em src/domain), que é sobre regra de negócio, não cor.
export const TABLE_STATUS_TONE: Record<
  TableStatus,
  "neutral" | "wine" | "gold" | "muted" | "free"
> = {
  FREE: "free",
  OCCUPIED: "wine",
  WAITING_SERVICE: "gold",
  ORDER_IN_PROGRESS: "gold",
  WAITING_CLOSING: "gold",
  PARTIALLY_PAID: "gold",
  RESERVED: "muted",
  BLOCKED: "muted",
};

// Cor sólida (faixa/indicador) equivalente a cada tom — usado na faixa
// colorida do card de mesa (identificação à distância, sem precisar ler o
// texto do badge). Ver nota sobre `free` em tailwind.config.ts.
export const STATUS_TONE_STRIP_CLASS: Record<
  "neutral" | "wine" | "gold" | "muted" | "free",
  string
> = {
  neutral: "bg-ink/20",
  wine: "bg-wine",
  gold: "bg-gold",
  muted: "bg-muted/50",
  free: "bg-free",
};

export const SERVICE_SESSION_STATUS_TONE: Record<
  ServiceSessionStatus,
  "neutral" | "wine" | "gold" | "muted"
> = {
  OPEN: "wine",
  WAITING_CLOSING: "gold",
  PARTIALLY_PAID: "gold",
  PAID: "gold",
  CLOSED: "neutral",
  REOPENED: "wine",
  CANCELLED: "muted",
};

export const ORDER_ITEM_STATUS_TONE: Record<
  OrderItemStatus,
  "neutral" | "wine" | "gold" | "muted"
> = {
  DRAFT: "muted",
  SENT: "gold",
  IN_PREPARATION: "gold",
  READY: "wine",
  DELIVERED: "neutral",
  CANCELLATION_REQUESTED: "muted",
  CANCELLED: "muted",
};

export const PRINT_JOB_STATUS_TONE: Record<PrintJobStatus, "neutral" | "wine" | "gold" | "muted"> = {
  PENDING: "gold",
  PROCESSING: "gold",
  PRINTED: "neutral",
  FAILED: "wine",
  CANCELLED: "muted",
};
