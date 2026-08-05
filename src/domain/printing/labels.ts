import type { PrintJobStatus, PrintJobType } from "@prisma/client";

export const PRINT_JOB_STATUS_LABELS: Record<PrintJobStatus, string> = {
  PENDING: "Pendente",
  PROCESSING: "Imprimindo",
  PRINTED: "Impresso",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

export const PRINT_JOB_TYPE_LABELS: Record<PrintJobType, string> = {
  NEW_ORDER: "Novo pedido",
  COMPLEMENT: "Complemento",
  CANCELLATION: "Cancelamento",
  REPRINT: "Reimpressão",
};
