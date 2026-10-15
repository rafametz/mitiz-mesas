import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canCloseTable } from "@/domain/service-session/closing";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class CloseTableError extends Error {}

// Núcleo do fechamento, parametrizado numa transação já aberta (ADR 0010
// — Pagamento Combinado): extraído pra poder ser composto, dentro da MESMA
// transação do checkout combinado, logo depois que o pagamento do PDV
// zera o saldo — fechamento automático da sessão do PDV (decisão do
// usuário 2026-10-15: PDV fecha sozinho, sem "solicitar fechamento").
// `closeTable` (abaixo) continua se comportando exatamente igual.
export async function closeTableInTx(
  tx: Prisma.TransactionClient,
  serviceSessionId: string,
  actorUserId: string,
) {
  const session = await tx.serviceSession.findUniqueOrThrow({
    where: { id: serviceSessionId },
  });

  if (!canCloseTable(session.status, session.balanceAmount)) {
    throw new CloseTableError(
      session.status === "CLOSING"
        ? "Saldo da comanda ainda não está zerado."
        : "Solicite o fechamento antes de finalizar.",
    );
  }

  await tx.serviceSession.update({
    where: { id: serviceSessionId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  if (session.tableId) {
    await tx.table.update({ where: { id: session.tableId }, data: { status: "FREE" } });
  }

  await writeAuditLog(tx, {
    restaurantId: session.restaurantId,
    userId: actorUserId,
    tableId: session.tableId,
    action: "service_session.closed",
    entityType: "ServiceSession",
    entityId: session.id,
    metadata: { totalAmount: session.totalAmount.toString() },
  });

  return session;
}

// Passo final do fechamento (business-rules.md §6, passos 7-9): valida
// saldo zero no servidor (nunca confia em nada vindo do cliente — CLAUDE.md
// regra 24), finaliza o atendimento e libera a mesa. Ação explícita
// separada de "o saldo zerou" (registerPayment já leva pra PAID sozinho) —
// alguém com TABLES_CLOSE ainda precisa confirmar, dando espaço pra
// conferir antes de liberar a mesa pro próximo cliente. Mesmo racional
// vale para finalizar uma retirada (módulo Retiradas, 2026-08-14) — só que
// aí não existe mesa física para liberar.
export async function closeTable(serviceSessionId: string, actorUserId: string) {
  const result = await prisma.$transaction((tx) =>
    closeTableInTx(tx, serviceSessionId, actorUserId),
  );

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.closed"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}
