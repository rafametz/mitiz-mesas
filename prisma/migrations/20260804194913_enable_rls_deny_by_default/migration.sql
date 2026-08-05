-- Habilita Row Level Security em todas as tabelas do schema public, sem
-- nenhuma política (= deny-by-default para os papéis "anon" e
-- "authenticated" que o Supabase usa na API REST/GraphQL pública).
--
-- Isto NÃO bloqueia o acesso da aplicação: o Prisma conecta como
-- "postgres" (dono das tabelas), e o dono de uma tabela não é afetado por
-- RLS a menos que FORCE ROW LEVEL SECURITY seja usado (não é o caso aqui).
--
-- Ver docs/architecture/decisions/0002-adocao-supabase.md
-- (seção "Segurança — Row Level Security (RLS)") e
-- docs/database/schema.md §2.9.
ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "production_sectors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "printers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_modifier_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_modifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_item_modifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
