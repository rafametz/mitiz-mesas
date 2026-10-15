-- Pagamento Combinado (mesa + PDV numa confirmação só) — ADR 0010,
-- aprovada pelo usuário 2026-10-15. "combined_checkouts" só agrupa
-- Payment de origens diferentes (mesa, PDV) pra gerar um recibo único;
-- não é um segundo sistema de pagamento — saldo, idempotência e estorno
-- de cada Payment continuam exatamente como já funcionam hoje (ver
-- comentário completo em prisma/schema.prisma, model CombinedCheckout).
--
-- RLS habilitado já nesta migration (lição da varredura de segurança
-- 2026-10-06 — payment_item_allocations ficou sem RLS na própria
-- migration que a criou; não repetir).

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "combinedCheckoutId" TEXT;

-- CreateTable
CREATE TABLE "combined_checkouts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "registeredById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combined_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "combined_checkouts_idempotencyKey_key" ON "combined_checkouts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "combined_checkouts_restaurantId_idx" ON "combined_checkouts"("restaurantId");

-- CreateIndex
CREATE INDEX "payments_combinedCheckoutId_idx" ON "payments"("combinedCheckoutId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_combinedCheckoutId_fkey" FOREIGN KEY ("combinedCheckoutId") REFERENCES "combined_checkouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combined_checkouts" ADD CONSTRAINT "combined_checkouts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combined_checkouts" ADD CONSTRAINT "combined_checkouts_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (deny-by-default, sem política) -- acesso de verdade continua só
-- pelo Prisma (credenciais de banco da aplicação, não sujeitas a RLS).
ALTER TABLE "combined_checkouts" ENABLE ROW LEVEL SECURITY;
