import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "@/application/service-session/recalculate-totals";
import { sessionRealtimeChannels } from "@/application/service-session/session-realtime";
import { sectorChannel } from "@/lib/realtime/channels";
import { publishChange } from "@/lib/realtime/publish";
import { runAfterResponse } from "@/lib/run-after-response";
import { sumDecimals, ZERO } from "@/lib/money";

export class ReversePdvSaleError extends Error {}

const reasonSchema = z
  .string()
  .trim()
  .min(3, "Informe o motivo do estorno (mínimo 3 caracteres).")
  .max(300);

// Estorno de uma venda inteira do PDV (tela de gestão de vendas, pedido do
// usuário 2026-11-08: "às vezes foi feito uma venda errada... gostaria
// que fosse estornar esse valor"). Decisão tomada com o usuário: cancela
// TODOS os itens ativos + estorna TODOS os pagamentos ativos numa
// operação só — fica tudo zerado (subtotal, desconto, taxa, total, pago,
// saldo = 0), mas nada é apagado (regra 7/8) e o registro continua no
// histórico mostrando que foi estornada. Não mexe em estoque (decisão do
// usuário — nenhuma venda hoje desconta estoque automaticamente, fora do
// MVP, CLAUDE.md seção 4).
//
// Deliberadamente NÃO reaproveita cancelOrderItem/voidPayment: os dois
// existem para o fluxo de mesa (cancelOrderItem bloqueia item já
// DELIVERED — faz sentido quando o cliente já comeu; voidPayment abre sua
// própria transação, incompatível com fazer as duas coisas atomicamente
// aqui). Uma venda de balcão já fechada não tem "cliente comendo" pra
// proteger — o estorno precisa funcionar mesmo que o item já tenha
// passado pela produção inteira.
export async function reversePdvSale(pdvSessionId: string, actorUserId: string, reason: string) {
  const voidReason = reasonSchema.parse(reason);

  const result = await prisma.$transaction(
    async (tx) => {
      const session = await tx.serviceSession.findUniqueOrThrow({
        where: { id: pdvSessionId },
        include: {
          orders: { include: { items: true } },
          payments: true,
        },
      });

      if (session.type !== "PDV") {
        throw new ReversePdvSaleError("Esta operação só é permitida para vendas do PDV.");
      }
      if (session.status !== "CLOSED") {
        throw new ReversePdvSaleError("Esta venda não está em um estado que permita estorno.");
      }

      const activeItems = session.orders
        .flatMap((order) => order.items)
        .filter((item) => item.status !== "CANCELLED");
      const activePayments = session.payments.filter((payment) => payment.voidedAt === null);

      if (activeItems.length === 0 && activePayments.length === 0) {
        throw new ReversePdvSaleError("Esta venda já foi estornada.");
      }

      for (const item of activeItems) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            status: "CANCELLED",
            cancelReason: voidReason,
            cancelledAt: new Date(),
            cancelledById: actorUserId,
          },
        });
        await writeAuditLog(tx, {
          restaurantId: session.restaurantId,
          userId: actorUserId,
          tableId: null,
          action: "order_item.cancelled",
          entityType: "OrderItem",
          entityId: item.id,
          metadata: {
            reason: voidReason,
            fromStatus: item.status,
            toStatus: "CANCELLED",
            viaSaleReversal: true,
          },
        });
      }

      for (const payment of activePayments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { voidedAt: new Date(), voidReason, voidedById: actorUserId },
        });
        await writeAuditLog(tx, {
          restaurantId: session.restaurantId,
          userId: actorUserId,
          tableId: null,
          action: "payment.voided",
          entityType: "Payment",
          entityId: payment.id,
          metadata: { amount: payment.amount.toString(), reason: voidReason, viaSaleReversal: true },
        });
      }

      await writeAuditLog(tx, {
        restaurantId: session.restaurantId,
        userId: actorUserId,
        tableId: null,
        action: "pdv_sale.reversed",
        entityType: "ServiceSession",
        entityId: session.id,
        metadata: {
          reason: voidReason,
          itemsCancelled: activeItems.length,
          paymentsVoided: activePayments.length,
          amount: sumDecimals(activePayments.map((p) => p.amount)).toString(),
        },
      });

      // Tudo zerado — nenhum item ativo, nenhum pagamento ativo, nada a
      // descontar ou taxar (uma venda estornada não deve nada, nem tem
      // nada a receber). Mesmo racional de recalculateSessionTotals
      // (lê items/pagamentos frescos do banco, mas discount/serviceCharge
      // não têm uma tabela própria somada automaticamente — passar ZERO
      // aqui é o que de fato zera o total).
      const sectorIds = [...new Set(activeItems.map((item) => item.sectorId))];
      await recalculateSessionTotals(tx, session.id, {
        discountAmount: ZERO,
        serviceChargeAmount: ZERO,
        paidAmount: ZERO,
      });

      // recalculateSessionTotals grava os valores zerados no banco mas
      // não devolve o registro atualizado — relê aqui antes de retornar,
      // senão quem chama recebe de volta os valores de ANTES do estorno
      // (a variável `session` acima ainda tem o subtotal/total antigos
      // em memória, mesmo já tendo sido sobrescritos no banco).
      const reversedSession = await tx.serviceSession.findUniqueOrThrow({
        where: { id: session.id },
      });

      return { session: reversedSession, sectorIds };
    },
    { maxWait: 5000, timeout: 15000 },
  );

  await runAfterResponse(() =>
    publishChange(
      [...sessionRealtimeChannels(result.session), ...result.sectorIds.map(sectorChannel)],
      "pdv_sale.reversed",
    ),
  );

  return result.session;
}
