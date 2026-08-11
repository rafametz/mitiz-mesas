-- Separa PAGAMENTO de FECHAMENTO DO ATENDIMENTO (revisão de regra de
-- negócio 2026-08-10). Antes: registrar pagamento gravava PARTIALLY_PAID/
-- PAID em ServiceSession/Table, o que bloqueava novos pedidos mesmo sem
-- ninguém ter solicitado o fechamento. Agora: o único status que bloqueia
-- pedido novo é CLOSING (fechamento pedido explicitamente); pagamento nunca
-- muda o status da sessão sozinho.
--
-- Ordem importa: primeiro renomeia (sem reescrever a tabela), depois migra
-- os dados que ainda usam os valores que vão sumir, só então recria os
-- enums sem eles. Fluxo de migration manual documentado em
-- docs/database/schema.md §7 (shadow database não funciona contra o
-- pooler do Supabase).

-- 1. Renomeia WAITING_CLOSING -> CLOSING (operação leve, não reescreve a
--    tabela).
ALTER TYPE "ServiceSessionStatus" RENAME VALUE 'WAITING_CLOSING' TO 'CLOSING';

-- 2. Migra dados que hoje usam PARTIALLY_PAID/PAID em ServiceSession
--    (valores que vão deixar de existir no enum).
--
--    PAID nunca esteve em ACTIVE_SERVICE_SESSION_STATUSES (bug real,
--    confirmado nesta migration: a Mesa 1 tinha uma sessão PAID nunca
--    fechada via closeTable — por não contar como "ativa", o app deixou
--    abrir um atendimento novo na mesma mesa por cima). Por isso a regra
--    de backfill primeiro verifica se já existe outra sessão ativa
--    (OPEN/CLOSING) na mesma mesa:
--      - se existe -> essa aqui é órfã, fecha de vez (CLOSED);
--      - senão, se já teve fechamento solicitado (auditoria) -> CLOSING;
--      - senão -> volta pra OPEN (nunca deveria ter saído de lá).
UPDATE "service_sessions" ss
SET
  "status" = (
    CASE
      WHEN EXISTS (
        SELECT 1 FROM "service_sessions" other
        WHERE other."tableId" = ss."tableId"
          AND other."id" <> ss."id"
          AND other."status" IN ('OPEN', 'CLOSING')
      ) THEN 'CLOSED'
      WHEN EXISTS (
        SELECT 1 FROM "audit_logs" al
        WHERE al."entityType" = 'ServiceSession'
          AND al."entityId" = ss."id"
          AND al."action" = 'service_session.closing_requested'
      ) THEN 'CLOSING'
      ELSE 'OPEN'
    END
  )::"ServiceSessionStatus",
  "closedAt" = CASE
    WHEN EXISTS (
      SELECT 1 FROM "service_sessions" other
      WHERE other."tableId" = ss."tableId"
        AND other."id" <> ss."id"
        AND other."status" IN ('OPEN', 'CLOSING')
    ) THEN CURRENT_TIMESTAMP
    ELSE ss."closedAt"
  END
WHERE ss."status" IN ('PARTIALLY_PAID', 'PAID');

-- Registra em auditoria as sessões órfãs fechadas automaticamente acima —
-- rastreável, não um valor mudando "do nada" (CLAUDE.md regra 22).
INSERT INTO "audit_logs" ("id", "restaurantId", "userId", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  t."restaurantId",
  NULL,
  'service_session.closed_by_migration',
  'ServiceSession',
  ss."id",
  jsonb_build_object(
    'migration', '20260810160849_separate_payment_from_closing',
    'reason', 'Sessão paga (PAID) nunca finalizada via closeTable — a mesa já tinha um atendimento novo aberto por cima (PAID não contava como ativo, bug corrigido nesta migration).'
  ),
  CURRENT_TIMESTAMP
FROM "service_sessions" ss
JOIN "tables" t ON t."id" = ss."tableId"
WHERE ss."status" = 'CLOSED'
  AND ss."closedAt" = CURRENT_TIMESTAMP
  AND EXISTS (
    SELECT 1 FROM "service_sessions" other
    WHERE other."tableId" = ss."tableId" AND other."id" <> ss."id" AND other."status" IN ('OPEN', 'CLOSING')
  );

-- 3. Espelha em Table: qualquer mesa em PARTIALLY_PAID (só existia como
--    reflexo do pagamento) volta a refletir a sessão ativa de verdade —
--    OCCUPIED se ela é OPEN, WAITING_CLOSING se é CLOSING, senão FREE.
UPDATE "tables" t
SET "status" = (
  CASE
    WHEN EXISTS (SELECT 1 FROM "service_sessions" s WHERE s."tableId" = t."id" AND s."status" = 'OPEN')
      THEN 'OCCUPIED'
    WHEN EXISTS (SELECT 1 FROM "service_sessions" s WHERE s."tableId" = t."id" AND s."status" = 'CLOSING')
      THEN 'WAITING_CLOSING'
    ELSE 'FREE'
  END
)::"TableStatus"
WHERE t."status" = 'PARTIALLY_PAID';

-- 4. O índice único parcial de "uma mesa, um atendimento ativo"
--    (prisma/migrations/20260804194825_..., CLAUDE.md regra 1) depende da
--    coluna "status" — precisa cair ANTES de trocar o tipo dela (senão o
--    Postgres tenta reconstruir o índice comparando o tipo novo com o
--    predicado ainda escrito contra o tipo antigo, e falha com "operator
--    does not exist"). Recriado mais abaixo já com os novos valores.
DROP INDEX IF EXISTS "service_sessions_one_active_per_table";

-- 5. Recria ServiceSessionStatus sem PARTIALLY_PAID/PAID (Postgres não
--    tem DROP VALUE em enum — precisa recriar o tipo).
CREATE TYPE "ServiceSessionStatus_new" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED', 'CANCELLED');
ALTER TABLE "service_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "service_sessions" ALTER COLUMN "status" TYPE "ServiceSessionStatus_new"
  USING ("status"::text::"ServiceSessionStatus_new");
ALTER TABLE "service_sessions" ALTER COLUMN "status" SET DEFAULT 'OPEN';
DROP TYPE "ServiceSessionStatus";
ALTER TYPE "ServiceSessionStatus_new" RENAME TO "ServiceSessionStatus";

-- 6. Recria TableStatus sem PARTIALLY_PAID (deixou de ser um estado
--    gravado — "tem pagamento parcial?" passa a ser sempre calculado a
--    partir de paidAmount/balanceAmount, como a tela /mesas já faz hoje).
CREATE TYPE "TableStatus_new" AS ENUM ('FREE', 'OCCUPIED', 'WAITING_SERVICE', 'ORDER_IN_PROGRESS', 'WAITING_CLOSING', 'RESERVED', 'BLOCKED');
ALTER TABLE "tables" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "tables" ALTER COLUMN "status" TYPE "TableStatus_new"
  USING ("status"::text::"TableStatus_new");
ALTER TABLE "tables" ALTER COLUMN "status" SET DEFAULT 'FREE';
DROP TYPE "TableStatus";
ALTER TYPE "TableStatus_new" RENAME TO "TableStatus";

-- 7. Recria o índice único parcial derrubado no passo 4, agora com os
--    novos valores de status ativo.
CREATE UNIQUE INDEX "service_sessions_one_active_per_table"
  ON "service_sessions" ("tableId")
  WHERE "status" IN ('OPEN', 'CLOSING');

-- 8. Pagamento por pessoa: status da pessoa (ACTIVE/SETTLED, manual —
--    marcar/desmarcar não depende de cálculo, é decisão do caixa).
CREATE TYPE "GuestStatus" AS ENUM ('ACTIVE', 'SETTLED');
ALTER TABLE "guests" ADD COLUMN "status" "GuestStatus" NOT NULL DEFAULT 'ACTIVE';

-- 9. Pagamento por pessoa: vínculo opcional Payment -> Guest (null =
--    pagamento geral da mesa, como já era).
ALTER TABLE "payments" ADD COLUMN "guestId" TEXT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_guestId_fkey"
  FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "payments_guestId_idx" ON "payments"("guestId");
