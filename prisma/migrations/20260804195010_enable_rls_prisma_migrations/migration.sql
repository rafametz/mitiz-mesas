-- Defesa em profundidade: _prisma_migrations não tem dado de negócio, mas
-- está no schema public (logo, exposta pela API do Supabase por padrão) e
-- não faz sentido deixar de fora do deny-by-default.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
