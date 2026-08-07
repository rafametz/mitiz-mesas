import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canRequestClosing } from "@/domain/service-session/closing";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class RequestClosingError extends Error {}

// Garçom solicita (TABLES_CLOSE_REQUEST); Caixa/Admin também podem chamar
// isto direto antes de mexer em taxa/desconto/pagamento — o fechamento em
// si (fechar de fato) é uma ação separada (close-table.ts), controlada por
// permissão própria na camada de servidor.
export async function requestClosing(serviceSessionId: string, actorUserId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.serviceSession.findUniqueOrThrow({
      where: { id: serviceSessionId },
      include: { table: true },
    });

    if (!canRequestClosing(session.status)) {
      throw new RequestClosingError(
        "Esta mesa não está com atendimento aberto para solicitar fechamento.",
      );
    }

    await tx.serviceSession.update({
      where: { id: serviceSessionId },
      data: { status: "WAITING_CLOSING" },
    });

    await tx.table.update({ where: { id: session.tableId }, data: { status: "WAITING_CLOSING" } });

    await writeAuditLog(tx, {
      restaurantId: session.table.restaurantId,
      userId: actorUserId,
      action: "service_session.closing_requested",
      entityType: "ServiceSession",
      entityId: session.id,
    });

    return { tableId: session.tableId, restaurantId: session.table.restaurantId };
  });

  await runAfterResponse(() =>
    publishChange(
      [tableChannel(result.tableId), restaurantTablesChannel(result.restaurantId)],
      "service_session.closing_requested",
    ),
  );

  return result;
}
