-- Permissão de leitura de mesas, comandas e históricos (tables.view).
--
-- Motivo: as páginas de mesa, histórico e retirada só exigiam sessão, então
-- o perfil Produção lia totais financeiros de todas as mesas (varredura de
-- segurança 2026-10-06, item 2). Concedida a Administrador, Caixa e Garçom,
-- que já operam ou consultam mesas; Produção não recebe.
--
-- Migration em vez de `npm run prisma:seed`: o seed também cria o usuário
-- inicial e regrava senha, então não deve rodar em produção só para isto.
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.

INSERT INTO "permissions" ("id", "code", "description")
VALUES ('perm_tables_view', 'tables.view', 'tables.view')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'tables.view'
WHERE r."name" IN ('ADMIN', 'CASHIER', 'WAITER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
