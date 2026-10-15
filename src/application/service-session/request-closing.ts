import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canRequestClosing } from "@/domain/service-session/closing";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class RequestClosingError extends Error {}

// Núcleo da solicitação de fechamento, parametrizado numa transação já
// aberta (ADR 0010 — Pagamento Combinado): o orquestrador do checkout
// combinado usa isto pra levar a sessão do PDV de OPEN a CLOSING antes de
// registrar o(s) pagamento(s) dela — o PDV "fecha sozinho" (decisão do
// usuário 2026-10-15) por dentro continua passando por CLOSING, só que sem
// expor essa etapa como uma ação separada ao operador. `requestClosing`
// (abaixo) continua se comportando exatamente igual.
export async function requestClosingInTx(
  tx: Prisma.TransactionClient,
  serviceSessionId: string,
  actorUserId: string,
) {
  const session = await tx.serviceSession.findUniqueOrThrow({
    where: { id: serviceSessionId },
  });

  if (!canRequestClosing(session.status)) {
    throw new RequestClosingError("Este atendimento não está aberto para solicitar fechamento.");
  }

  await tx.serviceSession.update({
    where: { id: serviceSessionId },
    data: { status: "CLOSING" },
  });

  if (session.tableId) {
    await tx.table.update({ where: { id: session.tableId }, data: { status: "WAITING_CLOSING" } });
  }

  await writeAuditLog(tx, {
    restaurantId: session.restaurantId,
    userId: actorUserId,
    tableId: session.tableId,
    action: "service_session.closing_requested",
    entityType: "ServiceSession",
    entityId: session.id,
  });

  return session;
}

// Garçom solicita (TABLES_CLOSE_REQUEST); Caixa/Admin também podem chamar
// isto direto antes de mexer em taxa/desconto/pagamento — o fechamento em
// si (fechar de fato) é uma ação separada (close-table.ts), controlada por
// permissão própria na camada de servidor. Vale igual para retirada
// (módulo Retiradas, 2026-08-14) — só não mexe em Table quando não existe.
export async function requestClosing(serviceSessionId: string, actorUserId: string) {
  const result = await prisma.$transaction((tx) =>
    requestClosingInTx(tx, serviceSessionId, actorUserId),
  );

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.closing_requested"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}
