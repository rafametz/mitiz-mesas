-- Índice composto para a consulta mais repetida do sistema
-- (getTableWithActiveSession: filtra tableId + status juntos em quase
-- toda tela) — ver docs/performance/optimization-plan.md, Fase 5.
CREATE INDEX "service_sessions_tableId_status_idx" ON "service_sessions"("tableId", "status");
