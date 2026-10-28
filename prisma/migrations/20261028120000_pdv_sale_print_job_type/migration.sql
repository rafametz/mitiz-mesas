-- Recibo de venda do PDV (Módulo 17, docs/backlog.md -- Fase 2 do roadmap
-- MITIZ Gestão, 2026-10-28, Passo 6/ADR 0010 Passo 6): novo valor de
-- PrintJobType para o recibo de venda (formato próprio, não o ticket de
-- cozinha) -- discrimina mesa + loja quando a venda veio de um Pagamento
-- Combinado (ADR 0010). Aditivo: nenhum PrintJob existente muda de
-- comportamento.
--
-- (O `DROP INDEX "service_sessions_restaurantId_idx"` que normalmente
-- aparece no diff automático é uma deriva pré-existente sem relação com
-- esta mudança -- removido do script final, mesmo padrão já seguido em
-- toda migration anterior deste projeto.)

-- AlterEnum
ALTER TYPE "PrintJobType" ADD VALUE 'PDV_SALE';
