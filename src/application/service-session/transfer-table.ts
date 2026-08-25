import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { canTransferTable } from "@/domain/service-session/transfer";
import { canOpenTable } from "@/domain/table/states";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class TransferTableError extends Error {}

const transferTableSchema = z.object({
  serviceSessionId: z.string().min(1),
  destinationTableId: z.string().min(1),
});

// Troca de mesa (2026-08-21, pedido do usuário): mover um atendimento
// ativo inteiro de uma mesa pra outra, sem fechar/reabrir nada. Nenhum
// pedido, item, pagamento ou pessoa está vinculado à mesa em si — todos
// apontam pro atendimento (ServiceSession), que é quem sabe em qual mesa
// está (`tableId`). "Trocar de mesa" é só reapontar esse `tableId` pra
// mesa nova, liberar a mesa antiga e ocupar a nova — nada de horário,
// pedido ou pagamento muda, porque nunca esteve amarrado à mesa em si.
//
// Só pra mesa de destino livre (regra confirmada com o usuário: mover
// pra uma mesa já ocupada seria "juntar mesas", uma função diferente,
// fora deste escopo). Transacional (regra 17); o índice único parcial
// `service_sessions_one_active_per_table` é a rede de segurança final
// contra corrida (mesmo racional de open-table.ts) — alguém pode ter
// aberto a mesa destino entre a leitura e a escrita.
export async function transferTable(
  input: { serviceSessionId: string; destinationTableId: string },
  actorUserId: string,
) {
  const data = transferTableSchema.parse(input);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.serviceSession.findUniqueOrThrow({
        where: { id: data.serviceSessionId },
      });

      if (session.type !== "TABLE" || !session.tableId) {
        throw new TransferTableError("Este atendimento não está vinculado a uma mesa.");
      }
      if (!canTransferTable(session.status)) {
        throw new TransferTableError("Este atendimento não está mais ativo.");
      }
      if (session.tableId === data.destinationTableId) {
        throw new TransferTableError("Selecione uma mesa diferente da atual.");
      }

      const [fromTable, toTable] = await Promise.all([
        tx.table.findUniqueOrThrow({ where: { id: session.tableId } }),
        tx.table.findUniqueOrThrow({ where: { id: data.destinationTableId } }),
      ]);

      if (toTable.restaurantId !== session.restaurantId) {
        throw new TransferTableError("Mesa de destino inválida.");
      }
      if (!canOpenTable(toTable.status)) {
        throw new TransferTableError(
          "A mesa de destino não está livre. Atualize a página e tente de novo.",
        );
      }

      // Espelha o status que a mesa de origem já tinha (open-table.ts usa
      // OCCUPIED; request-closing.ts usa WAITING_CLOSING) — a troca não
      // muda em nada o estágio do atendimento, só onde ele está sentado.
      const newTableStatus = session.status === "CLOSING" ? "WAITING_CLOSING" : "OCCUPIED";

      await tx.serviceSession.update({
        where: { id: session.id },
        data: { tableId: toTable.id },
      });
      await tx.table.update({ where: { id: fromTable.id }, data: { status: "FREE" } });
      await tx.table.update({ where: { id: toTable.id }, data: { status: newTableStatus } });

      await writeAuditLog(tx, {
        restaurantId: session.restaurantId,
        userId: actorUserId,
        tableId: fromTable.id,
        action: "service_session.table_transferred",
        entityType: "ServiceSession",
        entityId: session.id,
        metadata: {
          fromTableId: fromTable.id,
          fromTableNumber: fromTable.number,
          toTableId: toTable.id,
          toTableNumber: toTable.number,
        },
      });

      return { restaurantId: session.restaurantId, fromTableId: fromTable.id, toTableId: toTable.id };
    });

    await runAfterResponse(() =>
      publishChange(
        [
          tableChannel(result.fromTableId),
          tableChannel(result.toTableId),
          restaurantTablesChannel(result.restaurantId),
        ],
        "service_session.table_transferred",
      ),
    );

    return result;
  } catch (error) {
    if (error instanceof TransferTableError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new TransferTableError(
        "A mesa de destino não está mais livre. Atualize a página e tente de novo.",
      );
    }
    throw error;
  }
}
