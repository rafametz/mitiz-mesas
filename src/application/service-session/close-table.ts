import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canCloseTable } from "@/domain/service-session/closing";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class CloseTableError extends Error {}

// Passo final do fechamento (business-rules.md §6, passos 7-9): valida
// saldo zero no servidor (nunca confia em nada vindo do cliente — CLAUDE.md
// regra 24), finaliza o atendimento e libera a mesa. Ação explícita
// separada de "o saldo zerou" (registerPayment já leva pra PAID sozinho) —
// alguém com TABLES_CLOSE ainda precisa confirmar, dando espaço pra
// conferir antes de liberar a mesa pro próximo cliente.
export async function closeTable(serviceSessionId: string, actorUserId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.serviceSession.findUniqueOrThrow({
      where: { id: serviceSessionId },
      include: { table: true },
    });

    if (!canCloseTable(session.status, session.balanceAmount)) {
      throw new CloseTableError(
        session.status === "PAID"
          ? "Saldo da comanda ainda não está zerado."
          : "Esta mesa ainda não está pronta para ser finalizada.",
      );
    }

    await tx.serviceSession.update({
      where: { id: serviceSessionId },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    await tx.table.update({ where: { id: session.tableId }, data: { status: "FREE" } });

    await writeAuditLog(tx, {
      restaurantId: session.table.restaurantId,
      userId: actorUserId,
      action: "service_session.closed",
      entityType: "ServiceSession",
      entityId: session.id,
      metadata: { totalAmount: session.totalAmount.toString() },
    });

    return { tableId: session.tableId, restaurantId: session.table.restaurantId };
  });

  await runAfterResponse(() =>
    publishChange(
      [tableChannel(result.tableId), restaurantTablesChannel(result.restaurantId)],
      "service_session.closed",
    ),
  );

  return result;
}
