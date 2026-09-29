import "server-only";
import type { Prisma } from "@prisma/client";
import { sumDecimals } from "@/lib/money";

// Recalcula reservedQuantity de uma RoastProduction a partir da soma dos
// itens ativos (mesmo racional de recalculateSessionTotals) — nunca soma
// ou subtrai delta em cima do valor em cache, sempre recomputa do zero
// dentro da transação que mudou algo. Uma reserva CANCELLED nunca é
// apagada (regra 6/7 do CLAUDE.md), só deixa de contar aqui.
export async function recalculateReservedQuantity(
  tx: Prisma.TransactionClient,
  roastProductionId: string,
): Promise<void> {
  const items = await tx.roastReservationItem.findMany({
    where: {
      roastProductionId,
      reservation: { status: { not: "CANCELLED" } },
    },
    select: { quantity: true },
  });

  const reservedQuantity = sumDecimals(items.map((item) => item.quantity));

  await tx.roastProduction.update({
    where: { id: roastProductionId },
    data: { reservedQuantity },
  });
}
