-- Hash (SHA-256) do token que o agente local de impressão usa para
-- autenticar contra /api/print-jobs (Módulo 7) — nunca o token em texto
-- puro, mesmo racional de senha. Nulo até alguém gerar um token pela tela
-- /admin/impressoras.
ALTER TABLE "printers" ADD COLUMN "agentTokenHash" TEXT;
