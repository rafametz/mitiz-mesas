-- Heartbeat do agente local de impressão: atualizado a cada chamada
-- autenticada do agente (GET /api/print-jobs/pending, PATCH
-- /api/print-jobs/:id). Usado em /impressao para mostrar se o agente
-- está ativo ou parado, sem esperar um ticket sumir para alguém perceber.
ALTER TABLE "printers" ADD COLUMN "lastSeenAt" TIMESTAMPTZ(6);
