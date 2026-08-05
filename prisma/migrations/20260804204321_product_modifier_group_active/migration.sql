-- Permite desativar um grupo de adicionais sem apagar (consistente com
-- ProductModifier, que já tinha "active"). Módulo 2 — administração.
ALTER TABLE "product_modifier_groups" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
