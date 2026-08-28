-- Integração VHSYS (venda balcão/PDV, planejada 2026-08-25): vínculo
-- manual entre Product e o id_produto correspondente na VHSYS. Nulo até
-- alguém vincular pela tela /admin/integracoes/vhsys.
ALTER TABLE "products" ADD COLUMN "vhsysProductId" INTEGER;
