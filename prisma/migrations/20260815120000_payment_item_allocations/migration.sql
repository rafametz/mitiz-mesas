-- Pagamento por itens e rateio de consumo (2026-08-15). Ver
-- prisma/schema.prisma (modelo PaymentItemAllocation, enum AllocationKind,
-- OrderItem.openShareParts) e docs/architecture/decisions/
-- 0006-pagamento-por-itens.md para o racional completo.

-- 1. Campo informativo/mutável no próprio item: em quantas partes o SALDO
--    ABERTO atual está dividido agora ("Dividir item" / "Redistribuir").
--    Nulo em todo item existente (nenhum estava no modo compartilhado).
ALTER TABLE "order_items" ADD COLUMN "openShareParts" INTEGER;

-- 2. Tipo de fatia de um pagamento contra um item.
CREATE TYPE "AllocationKind" AS ENUM ('UNITS', 'AMOUNT');

-- 3. Tabela de alocação — liga um Payment a uma fatia de um OrderItem.
--    Restrict nas duas FKs, mesmo racional de Payment/Discount: nada
--    financeiro é apagado por cascade (regras 7/8 do CLAUDE.md).
CREATE TABLE "payment_item_allocations" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "kind" "AllocationKind" NOT NULL,
  "quantity" INTEGER,
  "shareNumerator" INTEGER,
  "shareDenominator" INTEGER,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_item_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_item_allocations"
  ADD CONSTRAINT "payment_item_allocations_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_item_allocations"
  ADD CONSTRAINT "payment_item_allocations_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payment_item_allocations_paymentId_idx" ON "payment_item_allocations"("paymentId");
CREATE INDEX "payment_item_allocations_orderItemId_idx" ON "payment_item_allocations"("orderItemId");
