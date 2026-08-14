-- Módulo Retiradas (2026-08-14): ServiceSession passa a representar tanto
-- um atendimento de mesa (como sempre foi) quanto um pedido avulso para
-- retirada, sem mesa física. Ver prisma/schema.prisma para o racional
-- completo e docs/database/schema.md §7 para o fluxo de migration manual
-- usado neste projeto (shadow database não funciona contra o pooler do
-- Supabase).

-- 1. Tipo de atendimento — todo registro existente é TABLE (default),
--    nenhum backfill de dado necessário além do default da coluna.
CREATE TYPE "ServiceSessionType" AS ENUM ('TABLE', 'PICKUP');
ALTER TABLE "service_sessions" ADD COLUMN "type" "ServiceSessionType" NOT NULL DEFAULT 'TABLE';

-- 2. Origem do pedido de retirada (tela "Nova retirada").
CREATE TYPE "PickupOrigin" AS ENUM ('COUNTER', 'WHATSAPP', 'PHONE');

-- 3. restaurantId denormalizado — hoje só existe via table.restaurantId,
--    e retirada não tem mesa para derivar isso. Backfill a partir da mesa
--    de cada sessão existente (todas são TABLE neste momento) antes de
--    tornar a coluna obrigatória.
ALTER TABLE "service_sessions" ADD COLUMN "restaurantId" TEXT;
UPDATE "service_sessions" ss
SET "restaurantId" = t."restaurantId"
FROM "tables" t
WHERE t."id" = ss."tableId";
ALTER TABLE "service_sessions" ALTER COLUMN "restaurantId" SET NOT NULL;
ALTER TABLE "service_sessions"
  ADD CONSTRAINT "service_sessions_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. tableId vira opcional (retirada não tem mesa). O índice único parcial
--    de "uma mesa, um atendimento ativo" (regra 1 do CLAUDE.md) depende
--    dessa coluna — cai antes de alterar o NOT NULL, mesmo racional já
--    usado em 20260810160849_separate_payment_from_closing ao trocar o
--    tipo de "status" (Postgres reconstruiria o índice contra o predicado
--    antigo e falharia).
DROP INDEX IF EXISTS "service_sessions_one_active_per_table";
ALTER TABLE "service_sessions" ALTER COLUMN "tableId" DROP NOT NULL;
-- Recriado já explicitando "tableId IS NOT NULL": sessões de retirada têm
-- tableId nulo e nunca devem competir por esta unicidade entre si (índice
-- único do Postgres já trata NULL como distinto por padrão, mas o
-- predicado deixa a intenção explícita em vez de depender disso).
CREATE UNIQUE INDEX "service_sessions_one_active_per_table"
  ON "service_sessions" ("tableId")
  WHERE "tableId" IS NOT NULL AND "status" IN ('OPEN', 'CLOSING');

-- 5. Campos específicos de retirada — todos nulos em atendimento de mesa.
ALTER TABLE "service_sessions"
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerPhone" TEXT,
  ADD COLUMN "pickupOrigin" "PickupOrigin",
  ADD COLUMN "requestedAt" TIMESTAMPTZ(6),
  ADD COLUMN "pickupNote" TEXT,
  ADD COLUMN "pickupNumber" INTEGER;

-- 6. "RETIRADA #047" — sequencial por restaurante, nunca reinicia (decisão
--    do usuário 2026-08-14). NULL para sessões de mesa; Postgres não
--    aplica unicidade entre NULLs, então múltiplas mesas convivem sem
--    colidir aqui.
CREATE UNIQUE INDEX "service_sessions_restaurantId_pickupNumber_key"
  ON "service_sessions" ("restaurantId", "pickupNumber");

-- 7. Índice de apoio para listar retiradas em andamento por restaurante
--    (/retiradas, /admin/retiradas): filtra por restaurantId + type, o
--    status ativo já é filtrado por cima na aplicação (poucas linhas).
CREATE INDEX "service_sessions_restaurantId_type_idx" ON "service_sessions"("restaurantId", "type");

CREATE INDEX "service_sessions_restaurantId_idx" ON "service_sessions"("restaurantId");
