-- PDV (venda de balcão) — Fase 2 do roadmap MITIZ Gestão, decidido com o
-- usuário 2026-10-15 (docs/product/visao-mitiz-gestao.md, seção 16).
-- Mesmo ServiceSession de TABLE/PICKUP, só um novo `type` (mesmo racional
-- de quando PICKUP foi criado, ADR 0005) — nenhuma tabela nova.
--
-- Permissão nova (pdv.sell) via INSERT direto, não pelo seed, pelo mesmo
-- motivo já documentado na migration 20261006130000_tables_view_permission:
-- o seed também recria/regrava o usuário inicial, não deve rodar em
-- produção só para isto. Concedida a ADMIN e CASHIER (CLAUDE.md/visão
-- MITIZ Gestão: "Caixa: PDV"). Idempotente.

ALTER TYPE "ServiceSessionType" ADD VALUE 'PDV';

INSERT INTO "permissions" ("id", "code", "description")
VALUES ('perm_pdv_sell', 'pdv.sell', 'pdv.sell')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."code" = 'pdv.sell'
WHERE r."name" IN ('ADMIN', 'CASHIER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

