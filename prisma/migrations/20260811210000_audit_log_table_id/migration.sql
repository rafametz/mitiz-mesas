-- Módulo 9 (tela de auditoria): AuditLog.tableId desnormalizado, pra
-- filtrar por mesa sem precisar de uma junção diferente por entityType
-- (OrderItem, Discount, ServiceCharge, ServiceSession, Payment, Guest
-- chegam na mesa por caminhos de relação diferentes). Só adição, sem
-- reescrever dado — registros existentes ficam com tableId nulo (sem
-- backfill, decisão registrada no comentário do schema).

ALTER TABLE "audit_logs" ADD COLUMN "tableId" TEXT;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "tables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "audit_logs_tableId_idx" ON "audit_logs"("tableId");
