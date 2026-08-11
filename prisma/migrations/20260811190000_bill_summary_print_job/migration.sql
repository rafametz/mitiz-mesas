-- Novo tipo de ticket: "Imprimir conferência" (CLAUDE.md seção 10, ações
-- da tela da mesa) — resumo do atendimento inteiro (itens consolidados de
-- todos os pedidos, total, divisão igual por pessoa, pagamentos já
-- registrados e saldo atual), diferente dos tickets existentes (que são
-- sempre sobre um Order específico, indo para um setor de produção).
--
-- orderId e sectorId viram opcionais (continuam obrigatórios na prática
-- para os outros tipos — validado na camada de aplicação, não dá pra
-- expressar isso no schema). serviceSessionId é o novo vínculo, só
-- preenchido para BILL_SUMMARY.

-- 1. Novo valor do enum (não precisa recriar o tipo — só ADIÇÃO, não
--    remoção de valor existente).
ALTER TYPE "PrintJobType" ADD VALUE 'BILL_SUMMARY';

-- 2. orderId e sectorId deixam de ser obrigatórios.
ALTER TABLE "print_jobs" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "print_jobs" ALTER COLUMN "sectorId" DROP NOT NULL;

-- 3. Novo vínculo opcional com o atendimento (ServiceSession).
ALTER TABLE "print_jobs" ADD COLUMN "serviceSessionId" TEXT;
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_serviceSessionId_fkey"
  FOREIGN KEY ("serviceSessionId") REFERENCES "service_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
