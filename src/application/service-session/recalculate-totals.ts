import "server-only";
import type { Prisma } from "@prisma/client";
import { sumDecimals, toDecimal, ZERO } from "@/lib/money";

type KnownSessionAmounts = {
  discountAmount: Prisma.Decimal | string | number;
  serviceChargeAmount: Prisma.Decimal | string | number;
  paidAmount: Prisma.Decimal | string | number;
};

// Recalcula os valores em cache da comanda (CLAUDE.md — ServiceSession
// guarda subtotal/desconto/taxa/total/pago/saldo para não precisar somar
// tudo de novo toda vez que a tela abre). Roda dentro da mesma transação
// de quem mudou algo que afeta o total (criar pedido, cancelar item —
// depois, aplicar desconto/taxa/pagamento nos Módulos 8).
//
// Desconto e taxa de serviço ainda não existem (Módulo 8) — ficam como já
// estão gravados (0 por padrão), não são recalculados aqui.
//
// `knownAmounts` é opcional: quem chama pode passar os 3 valores se já
// tiver buscado a ServiceSession por outro motivo na mesma transação
// (create-order.ts e cancel-order-item.ts fazem isso) — evita buscar a
// mesma linha de novo à toa (docs/performance/audit.md, achado #2/#7).
// Sem isso, busca do jeito de sempre.
export async function recalculateSessionTotals(
  tx: Prisma.TransactionClient,
  serviceSessionId: string,
  knownAmounts?: KnownSessionAmounts,
) {
  const items = await tx.orderItem.findMany({
    where: {
      order: { serviceSessionId },
      status: { not: "CANCELLED" },
    },
    include: { modifiers: true },
  });

  const subtotalAmount = sumDecimals(
    items.map((item) => {
      const modifiersTotal = sumDecimals(
        item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
      );
      return toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);
    }),
  );

  const amounts =
    knownAmounts ??
    (await tx.serviceSession.findUniqueOrThrow({ where: { id: serviceSessionId } }));
  const discountAmount = toDecimal(amounts.discountAmount);
  const serviceChargeAmount = toDecimal(amounts.serviceChargeAmount);
  const paidAmount = toDecimal(amounts.paidAmount);

  const totalAmount = subtotalAmount.sub(discountAmount).add(serviceChargeAmount);
  const balanceAmount = totalAmount.sub(paidAmount).lessThan(ZERO)
    ? ZERO
    : totalAmount.sub(paidAmount);

  await tx.serviceSession.update({
    where: { id: serviceSessionId },
    data: { subtotalAmount, totalAmount, balanceAmount },
  });
}
