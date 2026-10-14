-- Habilita RLS (deny-by-default, sem política) nas duas tabelas criadas na
-- migration anterior (20261014120000_cadastro_produtos_ampliado_e_importacao)
-- — ficou faltando na própria migration que criou as tabelas, mesmo tipo de
-- lacuna que a varredura de segurança de 2026-10-06 encontrou em
-- payment_item_allocations (docs/database/schema.md, item 10). Corrigido
-- antes de qualquer dado real entrar nessas tabelas.
--
-- O acesso de leitura/escrita legítimo continua sendo o Prisma (credenciais
-- de banco da aplicação, não sujeitas a RLS) — isto só impede leitura via
-- API pública do Supabase com a chave anônima.

ALTER TABLE "product_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_import_rows" ENABLE ROW LEVEL SECURITY;
