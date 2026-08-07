// Zera TODAS as mesas do restaurante — apaga todo atendimento (com pedidos,
// itens, pagamentos etc.) e devolve cada mesa pro status FREE. As mesas em
// si (Table) NÃO são apagadas, só o histórico operacional acumulado nelas.
//
// Diferente de cleanup-e2e-test-data.ts (que só mexe em registros cujo
// NOME casa com o padrão dos specs E2E): este script não filtra por nome —
// apaga o atendimento de toda mesa, real ou de teste. Só existe porque o
// usuário confirmou que todo o dado atual é de desenvolvimento/teste
// (nenhuma mesa em uso real ainda) e pediu explicitamente pra "zerar as
// mesas". Não rodar em produção com clientes reais sem ter certeza disso de
// novo.
//
// Uso:
//   npm run reset:tables           # mostra o que seria apagado
//   npm run reset:tables -- --apply  # apaga de verdade

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const tables = await prisma.table.findMany({
    include: { serviceSessions: { include: { orders: true } } },
    orderBy: { number: "asc" },
  });

  const sessionsToClear = tables.flatMap((t) => t.serviceSessions);
  const sessionIds = sessionsToClear.map((s) => s.id);
  const orderIds = sessionsToClear.flatMap((s) => s.orders.map((o) => o.id));
  const tablesToFree = tables.filter((t) => t.serviceSessions.length > 0);

  console.log(`Mesas com atendimento: ${tablesToFree.length} de ${tables.length}`);
  for (const t of tablesToFree) {
    console.log(
      `  Mesa ${t.number}: ${t.serviceSessions.length} atendimento(s), ${t.serviceSessions.reduce((n, s) => n + s.orders.length, 0)} pedido(s)`,
    );
  }

  if (!apply) {
    console.log("\nModo simulação (sem --apply) — nada foi apagado.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderItemModifier.deleteMany({ where: { orderItem: { orderId: { in: orderIds } } } });
    await tx.printJob.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await tx.order.deleteMany({ where: { id: { in: orderIds } } });

    await tx.payment.deleteMany({ where: { serviceSessionId: { in: sessionIds } } });
    await tx.discount.deleteMany({ where: { serviceSessionId: { in: sessionIds } } });
    await tx.serviceCharge.deleteMany({ where: { serviceSessionId: { in: sessionIds } } });
    // Guest é apagado em cascata pelo onDelete: Cascade do ServiceSession.
    await tx.serviceSession.deleteMany({ where: { id: { in: sessionIds } } });

    await tx.table.updateMany({
      where: { id: { in: tablesToFree.map((t) => t.id) } },
      data: { status: "FREE" },
    });
  });

  console.log(`\n${tablesToFree.length} mesa(s) zerada(s) — todas voltaram pro status FREE.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
