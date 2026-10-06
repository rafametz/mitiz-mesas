-- Correção de segurança (alerta do Supabase Security Advisor, 2026-10-06:
-- "Table publicly accessible", rls_disabled_in_public). A tabela foi criada
-- pela migration 20260815120000_payment_item_allocations, que não habilitou RLS
-- como as demais tabelas de public (ver 20260804194913_enable_rls_deny_by_default).
-- Sem política = bloqueado para anon/authenticated (API pública do Supabase).
-- O Prisma conecta como dono da tabela, que não é afetado por RLS sem FORCE.

ALTER TABLE "payment_item_allocations" ENABLE ROW LEVEL SECURITY;
