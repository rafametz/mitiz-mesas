-- Idempotência em RoastReservation (regra 18/19 do CLAUDE.md), mesmo
-- racional de Order.idempotencyKey — faltou na migration anterior
-- (20260929120000_roast_reservations). Tabela ainda vazia em produção
-- neste momento, então NOT NULL direto é seguro (sem backfill).
ALTER TABLE "roast_reservations" ADD COLUMN "idempotencyKey" TEXT NOT NULL;
CREATE UNIQUE INDEX "roast_reservations_idempotencyKey_key" ON "roast_reservations"("idempotencyKey");
