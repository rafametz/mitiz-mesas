// Remove dado de teste acumulado pela suíte E2E (tests/e2e/*.spec.ts) do
// banco de desenvolvimento. Os specs criam mesas/setores/categorias/
// produtos com sufixo aleatório e nunca limpam depois — ver nota em
// docs/backlog.md (Módulo 4 e "Repaginação visual"). Isso não é dado real
// de cliente: só apaga o que casa com os padrões de nome usados pelos
// próprios specs ("E2E-", "PED-", "PDV-E2E", ou " E2E "/" PED " dentro do
// nome).
//
// Uso:
//   npm run cleanup:e2e-data           # mostra o que seria apagado
//   npm run cleanup:e2e-data -- --apply  # apaga de verdade
//
// Ordem de exclusão respeita as constraints onDelete: Restrict do schema
// (prisma/schema.prisma): itens de pedido antes do pedido, pedido antes do
// atendimento, atendimento antes da mesa, produto antes de categoria/setor,
// alocação antes do pagamento. AuditLog nunca é apagado (regra 7/8 do
// CLAUDE.md) — fica com entityId órfão, o que é inofensivo (não tem FK,
// não aparece em nenhuma tela).

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_NAME_PATTERN = /(^|[\s-])(E2E|PED)([\s-]|$)/;

async function main() {
  const apply = process.argv.includes("--apply");

  const restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) throw new Error("Nenhum Restaurant encontrado.");

  const tables = await prisma.table.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, number: true },
  });
  const testTableIds = tables.filter((t) => TEST_NAME_PATTERN.test(t.number)).map((t) => t.id);

  const mesaSessions = await prisma.serviceSession.findMany({
    where: { tableId: { in: testTableIds } },
    select: { id: true },
  });

  // Nome é o sinal real de "produto de teste" — calculado já aqui (não só
  // depois do corte por testOrderIds) porque é usado pra achar também as
  // sessões do PDV abaixo, que não têm mesa (Módulo 17, ADR 0010:
  // sellPdv/registerCombinedCheckout criam ServiceSession tipo PDV sem
  // tableId, fora do alcance do rastreamento por mesa).
  const products = await prisma.product.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
  });
  const candidateProductIds = products
    .filter((p) => TEST_NAME_PATTERN.test(p.name))
    .map((p) => p.id);

  const pdvOrderItems = await prisma.orderItem.findMany({
    where: {
      productId: { in: candidateProductIds },
      order: { serviceSession: { type: "PDV" } },
    },
    select: { order: { select: { serviceSessionId: true } } },
  });
  const pdvSessionIds = [...new Set(pdvOrderItems.map((item) => item.order.serviceSessionId))];

  const testSessionIds = [...mesaSessions.map((s) => s.id), ...pdvSessionIds];

  const orders = await prisma.order.findMany({
    where: { serviceSessionId: { in: testSessionIds } },
    select: { id: true },
  });
  const testOrderIds = orders.map((o) => o.id);

  const categories = await prisma.category.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
  });
  const testCategoryIds = new Set(
    categories.filter((c) => TEST_NAME_PATTERN.test(c.name)).map((c) => c.id),
  );

  const sectors = await prisma.productionSector.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, name: true },
  });
  const testSectorIds = new Set(
    sectors.filter((s) => TEST_NAME_PATTERN.test(s.name)).map((s) => s.id),
  );

  const testProductIds = new Set(candidateProductIds);

  // Produtos/categorias/setores de teste ainda referenciados por um
  // OrderItem que NÃO vai ser apagado (pedido de uma mesa/venda "real")
  // não podem ser removidos sem violar onDelete: Restrict — pulamos e
  // avisamos.
  const remainingOrderItems = await prisma.orderItem.findMany({
    where: { orderId: { notIn: testOrderIds } },
    select: { productId: true, sectorId: true },
  });
  for (const item of remainingOrderItems) {
    testProductIds.delete(item.productId);
    testSectorIds.delete(item.sectorId);
  }
  const remainingProducts = await prisma.product.findMany({
    where: { id: { notIn: [...testProductIds] } },
    select: { categoryId: true, defaultSectorId: true },
  });
  for (const p of remainingProducts) {
    testCategoryIds.delete(p.categoryId);
    testSectorIds.delete(p.defaultSectorId);
  }

  // Pagamento Combinado (ADR 0010): o CombinedCheckout agrupa um Payment da
  // mesa e um do PDV — qualquer um dos dois já sendo de teste é sinal
  // suficiente de que o agrupamento inteiro é de teste.
  const testPayments = await prisma.payment.findMany({
    where: { serviceSessionId: { in: testSessionIds }, combinedCheckoutId: { not: null } },
    select: { combinedCheckoutId: true },
  });
  const testCombinedCheckoutIds = [
    ...new Set(
      testPayments.map((p) => p.combinedCheckoutId).filter((id): id is string => id !== null),
    ),
  ];

  console.log(`Mesas de teste: ${testTableIds.length}`);
  console.log(`Sessões do PDV de teste: ${pdvSessionIds.length}`);
  console.log(`Atendimentos de teste (mesa + PDV): ${testSessionIds.length}`);
  console.log(`Pedidos de teste: ${testOrderIds.length}`);
  console.log(`Checkouts combinados de teste: ${testCombinedCheckoutIds.length}`);
  console.log(`Produtos de teste (sem uso fora do escopo): ${testProductIds.size}`);
  console.log(`Categorias de teste (sem uso fora do escopo): ${testCategoryIds.size}`);
  console.log(`Setores de teste (sem uso fora do escopo): ${testSectorIds.size}`);

  if (!apply) {
    console.log("\nModo simulação (sem --apply) — nada foi apagado.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderItemModifier.deleteMany({
      where: { orderItem: { orderId: { in: testOrderIds } } },
    });
    await tx.printJob.deleteMany({
      where: {
        OR: [{ orderId: { in: testOrderIds } }, { serviceSessionId: { in: testSessionIds } }],
      },
    });
    await tx.paymentItemAllocation.deleteMany({
      where: { payment: { serviceSessionId: { in: testSessionIds } } },
    });
    await tx.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
    await tx.order.deleteMany({ where: { id: { in: testOrderIds } } });

    await tx.payment.deleteMany({ where: { serviceSessionId: { in: testSessionIds } } });
    await tx.combinedCheckout.deleteMany({ where: { id: { in: testCombinedCheckoutIds } } });
    await tx.discount.deleteMany({ where: { serviceSessionId: { in: testSessionIds } } });
    await tx.serviceCharge.deleteMany({ where: { serviceSessionId: { in: testSessionIds } } });
    // Guest é apagado em cascata pelo onDelete: Cascade do ServiceSession.
    await tx.serviceSession.deleteMany({ where: { id: { in: testSessionIds } } });

    await tx.table.deleteMany({ where: { id: { in: testTableIds } } });

    // ProductModifierGroup/ProductModifier são cascade a partir do Product.
    await tx.product.deleteMany({ where: { id: { in: [...testProductIds] } } });
    await tx.category.deleteMany({ where: { id: { in: [...testCategoryIds] } } });
    await tx.productionSector.deleteMany({ where: { id: { in: [...testSectorIds] } } });
  });

  console.log("\nLimpeza concluída.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
