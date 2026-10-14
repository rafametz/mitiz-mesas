-- Controla se os produtos de uma categoria aparecem na tela de novo
-- pedido (mesas e retiradas) -- pedido do usuário 2026-10-14, depois da
-- importação VHSYS (ADR 0009, seção 0-B). Ver prisma/schema.prisma,
-- model Category.
--
-- DEFAULT true cobre automaticamente toda categoria já existente
-- (continuam aparecendo no pedido, nada muda pra elas). A categoria
-- "Loja" (criada pela importação VHSYS para os produtos ainda só de PDV)
-- é a única que vira false aqui -- mesmo efeito que `available: false`
-- já dava produto a produto, agora também no nível de categoria.

ALTER TABLE "categories" ADD COLUMN     "visibleInOrders" BOOLEAN NOT NULL DEFAULT true;

UPDATE "categories" SET "visibleInOrders" = false WHERE "name" = 'Loja';
