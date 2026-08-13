import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { publishChange } from "@/lib/realtime/publish";
import { tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class GuestSettlementError extends Error {}

// Pagamento por pessoa (revisão 2026-08-10): marcar/desmarcar SETTLED é
// manual e não depende de nenhum cálculo — decisão confirmada com o
// usuário (o caixa decide quando a participação de alguém está quitada;
// o valor calculado por deriveGuestParticipation é só referência na
// tela). Por isso não valida saldo aqui — só existência da pessoa e
// permissão (verificada por quem chama, na camada de servidor).
export async function markGuestSettled(guestId: string, actorUserId: string) {
  return setGuestStatus(guestId, actorUserId, "SETTLED", "guest.settled");
}

// Pessoa some do seletor de "pessoa" ao lançar item novo enquanto SETTLED
// (regra de UI) — reverter é simples: volta a poder receber item, sem
// desfazer nenhum pagamento já registrado.
export async function reopenGuest(guestId: string, actorUserId: string) {
  return setGuestStatus(guestId, actorUserId, "ACTIVE", "guest.reopened");
}

async function setGuestStatus(
  guestId: string,
  actorUserId: string,
  status: "ACTIVE" | "SETTLED",
  action: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const guest = await tx.guest.findUniqueOrThrow({
      where: { id: guestId },
      include: { serviceSession: { include: { table: true } } },
    });

    if (guest.status === status) {
      throw new GuestSettlementError(
        status === "SETTLED" ? "Esta pessoa já está quitada." : "Esta pessoa já está ativa.",
      );
    }

    await tx.guest.update({ where: { id: guestId }, data: { status } });

    await writeAuditLog(tx, {
      restaurantId: guest.serviceSession.table.restaurantId,
      userId: actorUserId,
      tableId: guest.serviceSession.tableId,
      action,
      entityType: "Guest",
      entityId: guest.id,
      metadata: { guestName: guest.name },
    });

    return { tableId: guest.serviceSession.tableId };
  });

  await runAfterResponse(() => publishChange([tableChannel(result.tableId)], "guest.status_changed"));

  return result;
}
