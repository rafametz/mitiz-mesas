import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canCancelClosingRequest } from "@/domain/service-session/closing";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class CancelClosingRequestError extends Error {}

// Caminho de volta de CLOSING pra OPEN (revisão 2026-08-10) — "pedi a
// conta por engano" ou o cliente quer pedir mais alguma coisa depois de
// já ter pedido o fechamento. Não precisa passar por fechar e reabrir o
// atendimento inteiro (isso é CLOSED → REOPENED, uma operação bem mais
// pesada, só admin). Mesma permissão de quem pode solicitar o fechamento
// — se pode pedir, pode desfazer o próprio pedido.
export async function cancelClosingRequest(serviceSessionId: string, actorUserId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.serviceSession.findUniqueOrThrow({
      where: { id: serviceSessionId },
      include: { table: true },
    });

    if (!canCancelClosingRequest(session.status)) {
      throw new CancelClosingRequestError("Esta mesa não está com fechamento solicitado.");
    }

    await tx.serviceSession.update({
      where: { id: serviceSessionId },
      data: { status: "OPEN" },
    });

    await tx.table.update({ where: { id: session.tableId }, data: { status: "OCCUPIED" } });

    await writeAuditLog(tx, {
      restaurantId: session.table.restaurantId,
      userId: actorUserId,
      tableId: session.tableId,
      action: "service_session.closing_cancelled",
      entityType: "ServiceSession",
      entityId: session.id,
    });

    return { tableId: session.tableId, restaurantId: session.table.restaurantId };
  });

  await runAfterResponse(() =>
    publishChange(
      [tableChannel(result.tableId), restaurantTablesChannel(result.restaurantId)],
      "service_session.closing_cancelled",
    ),
  );

  return result;
}
