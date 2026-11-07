-- Venda por peso no PDV (balança, pedido do usuário 2026-11-07) — ver
-- comentário completo em prisma/schema.prisma, model OrderItem. Aditiva:
-- duas colunas nulas, nenhuma linha existente muda de valor ou comportamento.

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "weightQuantity" DECIMAL(10,3);
ALTER TABLE "order_items" ADD COLUMN "weightUnitPriceAtOrder" DECIMAL(10,2);
