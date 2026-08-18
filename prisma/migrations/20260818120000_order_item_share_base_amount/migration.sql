-- Pagamento por itens: valor base fixo do rateio (correção 2026-08-18).
--
-- Até aqui o valor nominal de uma "parte" era sempre recalculado como
-- saldo aberto ATUAL / openShareParts, o que fazia cada parte ficar mais
-- barata a cada pagamento parcial (76 dividido em 4 partes de 19; depois
-- de pagar uma parte o saldo de 57 virava 4 partes de 14,25). Agora o
-- valor total no momento da divisão fica gravado junto, e o nominal da
-- parte é sempre essa base fixa / openShareParts, só mudando quando o
-- operador redivide de propósito ("Redistribuir").
ALTER TABLE "order_items" ADD COLUMN "openShareBaseAmount" DECIMAL(10,2);
