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
// de quem mudou algo que afeta o total: criar pedido, cancelar item
// (discountAmount/serviceChargeAmount/paidAmount inalterados, só repassam
// o valor atual) ou aplicar desconto/taxa/pagamento (Módulo 8 — quem
// chama já calculou o valor novo daquele campo específico).
//
// `knownAmounts` é opcional: quem chama pode passar os 3 valores se já
// tiver buscado/calculado a ServiceSession por outro motivo na mesma
// transação — evita buscar a mesma linha de novo à toa (docs/performance/
// audit.md, achado #2/#7). Sem isso, busca do jeito de sempre (útil só
// fora do fluxo normal, ex.: um script de correção pontual).
//
// Importante: os 3 campos são sempre GRAVADOS de volta aqui (não só lidos
// pra calcular total/saldo) — antes do Módulo 8 eles nunca mudavam, então
// "recalcular" só escrevia subtotal/total/saldo; virou um bug real assim
// que desconto/taxa/pagamento passaram a existir de verdade (a comanda
// calculava o total certo na hora, mas o valor gravado de discountAmount/
// serviceChargeAmount/paidAmount ficava sempre 0, expondo dado errado pra
// quem lesse a ServiceSession fora desta função).
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
    data: {
      subtotalAmount,
      discountAmount,
      serviceChargeAmount,
      paidAmount,
      totalAmount,
      balanceAmount,
    },
  });
}
