-- Garante, no nível do banco, que uma mesa não tenha mais de um atendimento
-- ativo simultaneamente (CLAUDE.md regra 1; ver docs/database/schema.md §4).
-- Índice único parcial: só considera linhas com status "ativo".
CREATE UNIQUE INDEX "service_sessions_one_active_per_table"
  ON "service_sessions" ("tableId")
  WHERE "status" IN ('OPEN', 'WAITING_CLOSING', 'PARTIALLY_PAID');
