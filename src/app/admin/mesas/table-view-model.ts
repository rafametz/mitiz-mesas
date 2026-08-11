import type { TableStatus } from "@prisma/client";

// Formato plano (sem Decimal/Date do Prisma) para atravessar a fronteira
// server -> client component (React Server Components só serializa dados
// simples) e para ser reaproveitado entre o cálculo dos cards, dos
// indicadores do topo e do gráfico.
export type TableCardData = {
  id: string;
  number: string;
  capacity: number | null;
  status: TableStatus;
  session: {
    openedAt: string;
    guestCount: number;
    waiterName: string;
    totalAmount: number;
    paidAmount: number;
    readyCount: number;
  } | null;
};

// Agrupamento dos 8 status de mesa (CLAUDE.md seção 7) nos 3 grandes
// indicadores do painel do administrador — hoje só FREE/OCCUPIED são
// realmente alcançados pelo fluxo (abrir mesa); os demais já ficam
// mapeados para quando os módulos de caixa (fechamento, pagamento parcial)
// e recepção (reserva) forem implementados.
export type StatusBucket = "free" | "occupied" | "closing" | "other";

export function statusBucket(status: TableStatus): StatusBucket {
  switch (status) {
    case "FREE":
      return "free";
    case "OCCUPIED":
    case "ORDER_IN_PROGRESS":
      return "occupied";
    case "WAITING_CLOSING":
      return "closing";
    default:
      return "other";
  }
}
