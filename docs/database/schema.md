# Modelagem do banco de dados — MITIZ Mesas

Fonte executável: [prisma/schema.prisma](../../prisma/schema.prisma). Este
documento explica as decisões por trás do schema; em caso de divergência, o
arquivo `.prisma` é a fonte de verdade.

Status: fundação aplicada (Módulo 0 do [backlog](../backlog.md)). A migration
inicial já rodou contra o projeto Supabase real (23 tabelas + índice único
parcial de "uma mesa, um atendimento ativo" + RLS habilitado em todas as
tabelas — ver seções 4 e 2.9). Nenhum dado de negócio foi inserido; isso
começa no Módulo 1.

## 1. Visão geral das entidades

Segue a estrutura de domínio da seção 13 do `CLAUDE.md`, mais `Restaurant`
(preparação multi-unidade, [ADR 0001](../architecture/decisions/0001-decisoes-tecnicas-iniciais.md)
item 6) e as tabelas de junção necessárias (`RolePermission`).

| Entidade                                  | Papel                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `Restaurant`                              | Unidade/tenant. Uma linha ativa no MVP.                                       |
| `Role`, `Permission`, `RolePermission`    | Perfis (Admin, Caixa, Garçom, Produção) e permissões finas, RBAC.             |
| `User`                                    | Usuário do sistema, vinculado a um `Restaurant` e um `Role`.                  |
| `ProductionSector`                        | Cozinha, Parrilla, Bar, Caixa, Sem impressão — configurável.                  |
| `Printer`                                 | Impressora física. Um único registro ativo no MVP (impressora térmica única). |
| `Table`                                   | Mesa física.                                                                  |
| `ServiceSession`                          | Atendimento — o agregado central do sistema. Pode ser de mesa (`type: TABLE`, com `tableId`) ou de retirada (`type: PICKUP`, sem mesa — `customerName`/`pickupNumber`/etc.). |
| `Guest`                                   | Pessoa dentro de um atendimento (opcional, nome/apelido).                     |
| `Category`, `Product`                     | Cardápio.                                                                     |
| `ProductModifierGroup`, `ProductModifier` | Adicionais/modificadores por produto.                                         |
| `Order`, `OrderItem`, `OrderItemModifier` | Pedidos e seus itens.                                                         |
| `PrintJob`                                | Fila de impressão por pedido/setor.                                           |
| `PaymentMethod`, `Payment`                | Formas e registros de pagamento.                                              |
| `PaymentItemAllocation`                   | Fatia de um `OrderItem` coberta por um `Payment` (unidades ou valor, com fração quando o item está dividido) — ADR 0006. |
| `Discount`, `ServiceCharge`               | Desconto e taxa de serviço aplicados ao atendimento.                          |
| `AuditLog`                                | Trilha de auditoria transversal.                                              |

## 2. Por que essas escolhas

### 2.1 Dinheiro nunca é float

Todo valor monetário usa `Decimal(10, 2)` (regra 20/21 do `CLAUDE.md`).
Cobre até R$ 99.999.999,99, mais que suficiente para o MVP. Percentuais
(desconto percentual, taxa de serviço) usam `Decimal(5, 2)`.

### 2.2 Horário em UTC, exibição em America/Sao_Paulo

Todo campo de data/hora usa `@db.Timestamptz(6)` (timestamp com timezone,
armazenado internamente em UTC pelo Postgres). A conversão para
`America/Sao_Paulo` acontece na camada de apresentação, nunca no banco
(regra 23).

### 2.3 Preço e nome "congelados" no pedido

`OrderItem.unitPrice` e `OrderItem.productNameAtOrder` (idem
`OrderItemModifier.priceDeltaAtOrder`/`modifierNameAtOrder`) copiam o valor
do produto/modificador no momento do lançamento. Alterar `Product.price`
depois não afeta pedidos já criados (regra 9/10). Optou-se por copiar os
campos direto no item em vez de criar uma tabela de histórico de preços
(`ProductPrice`) — mais simples e suficiente para o que a regra pede; pode
evoluir se um dia for necessário histórico de preço do cardápio em si
(fora do escopo do MVP).

### 2.4 Nada financeiro ou operacional crítico é apagado

Nenhuma relação para `Product`, `ServiceSession`, `Order`, `Payment`,
`Discount`, `ServiceCharge` ou `User` (como autor de uma ação) usa
`onDelete: Cascade`. Cancelamento e estorno são sempre um novo estado
(`CANCELLED`, `voidedAt` preenchido) sobre o registro existente, nunca uma
exclusão de linha (regras 6, 7, 8).

`onDelete: Cascade` só é usado onde o filho não tem existência própria fora
do pai e não é um registro financeiro: `RolePermission`, `Guest` (dentro do
atendimento), `ProductModifierGroup`/`ProductModifier` (dentro do produto),
`OrderItemModifier` (dentro do item).

### 2.5 Idempotência

`Order.idempotencyKey` e `Payment.idempotencyKey` são `@unique`. O cliente
(app do garçom/caixa) gera a chave (ex.: UUID) antes de enviar a requisição;
reenviar a mesma requisição (duplo toque, retry de rede instável) bate na
constraint única e não duplica o registro (regra 18/19).

### 2.6 Auditoria

`AuditLog` é genérico (`entityType` + `entityId` + `action` + `metadata`
JSON) para cobrir qualquer ação crítica futura sem precisar de uma tabela de
auditoria por entidade. `userId` é opcional (`SetNull` ao remover usuário)
para o log sobreviver mesmo que o usuário seja desativado/removido no
futuro.

### 2.7 Impressão — modelo pronto para 1 impressora, escala para N

Por decisão confirmada (impressora térmica única, local — ADR 0001 item 3),
`PrintJob.printerId` é opcional e todo `PrintJob`, independente do setor,
tende a ser atendido pelo único `Printer` ativo. O modelo mantém `Printer`
e `ProductionSector` como entidades separadas de propósito: se um dia
existir mais de uma impressora, não é necessária migração de schema, só
passar a atribuir `printerId` por setor.

`PrintJob.contentSnapshot` (JSON) guarda o conteúdo já montado do ticket
(itens, mesa, horário, garçom, setor, observações, tipo) — permite
reimprimir exatamente o que foi impresso originalmente, mesmo que dados
relacionados (nome do produto, mesa) mudem depois.

### 2.8 Autenticação — Supabase Auth, não senha própria

`User` não tem campo de senha. Quem guarda a credencial é o Supabase Auth,
em `auth.users` (schema que o Prisma não gerencia). `User.authUserId` é o
`id` (UUID) do usuário correspondente em `auth.users` — uma referência
lógica, checada/mantida pela aplicação, não uma foreign key de banco.
`User` continua sendo a fonte de verdade para dado de aplicação: a qual
`Restaurant` pertence, qual `Role` tem, se está `active`. Ver
[ADR 0002](../architecture/decisions/0002-adocao-supabase.md).

### 2.9 Row Level Security (RLS) — obrigatório antes de dado real

O Supabase expõe todo o schema `public` via API REST/GraphQL por padrão.
**Toda tabela deste schema precisa de RLS habilitado com política
deny-by-default antes de qualquer dado real (de clientes, funcionários ou
vendas) existir no banco.** O caminho de leitura/escrita legítimo continua
sendo o backend Next.js (via Prisma, com as credenciais de banco da
aplicação) — RLS é a rede de segurança contra acesso direto via chave
pública (`anon`)/API do Supabase. Detalhe e justificativa em
[ADR 0002](../architecture/decisions/0002-adocao-supabase.md#segurança--row-level-security-rls).

## 3. Regras de integridade que o schema garante sozinho

- `User.email` único;
- `Table` única por `(restaurantId, number)`;
- `Category`/`Product` (via `Category`) únicos por nome dentro do restaurante;
- `ProductionSector` e `Printer` únicos por nome dentro do restaurante;
- `Order.idempotencyKey` e `Payment.idempotencyKey` únicos globalmente;
- `Order` único por `(serviceSessionId, sequenceNumber)` — não duplica número
  de pedido dentro do mesmo atendimento;
- toda FK para entidade financeira/operacional crítica é `Restrict` por
  padrão — o banco recusa a operação em vez de deixar um estado inconsistente
  passar despercebido.

## 4. Regra de integridade que precisa de SQL manual

**Uma mesa só pode ter um atendimento ativo por vez** (regra 1 do
`CLAUDE.md`) é uma unicidade _condicional_ (`table_id IS NOT NULL AND status
IN ('OPEN', 'CLOSING')`), que o Prisma Schema Language não expressa de forma
declarativa (não suporta índice único parcial):

```sql
CREATE UNIQUE INDEX service_sessions_one_active_per_table
  ON service_sessions (table_id)
  WHERE table_id IS NOT NULL AND status IN ('OPEN', 'CLOSING');
```

A regra também é validada na camada de aplicação, dentro de uma transação
(checar se já existe sessão ativa antes de criar uma nova). O banco é a
rede de segurança final; a aplicação não deve depender só dele nem só da
validação de UI (regra 24). Essa regra nunca se aplica a atendimento de
retirada (`type: PICKUP`) — `table_id` é sempre nulo nesse caso, e o
predicado `table_id IS NOT NULL` exclui essas linhas do índice de propósito
(módulo Retiradas, 2026-08-14; ver `20260814120000_pickup_sessions`).

## 5. O que ainda não está no schema (de propósito)

- Seed de dados de referência (perfis, setores iniciais, formas de
  pagamento) — entra no Módulo 1/2 do backlog, junto com as telas de
  administração que os usam;
- Tabelas de sessão/token de autenticação — entram no Módulo 1, quando
  Auth.js for configurado;
- Qualquer coisa fora do MVP (seção 4 do `CLAUDE.md`): nota fiscal, estoque,
  integração com PDV além dos campos de preparação já previstos na visão
  arquitetural.

## 6. Estado atual (concluído)

1. ✅ Projeto Supabase criado pelo usuário;
2. ✅ `.env` preenchido (não commitado — está no `.gitignore`);
3. ✅ Migration inicial aplicada (`prisma/migrations/20260804194743_init`) —
   23 tabelas;
4. ✅ Índice único parcial de "uma mesa, um atendimento ativo"
   (`prisma/migrations/20260804194825_service_sessions_one_active_per_table`);
5. ✅ RLS deny-by-default habilitado em todas as tabelas, inclusive
   `_prisma_migrations`
   (`prisma/migrations/20260804194913_enable_rls_deny_by_default` e
   `..._enable_rls_prisma_migrations`). Verificado via
   `pg_class.relrowsecurity` e leitura de teste pelo Prisma (que conecta
   como dono das tabelas — RLS não bloqueia a aplicação, só a API pública
   do Supabase sem policy).
6. ✅ Separação pagamento/fechamento (ADR 0004) —
   `prisma/migrations/20260810160849_separate_payment_from_closing`:
   renomeia `ServiceSessionStatus.WAITING_CLOSING` → `CLOSING`, remove
   `PARTIALLY_PAID`/`PAID` do enum (com backfill de dados existentes,
   incluindo uma sessão órfã real fechada explicitamente pela própria
   migration), remove `PARTIALLY_PAID` de `TableStatus`, adiciona
   `Guest.status` (`GuestStatus`) e `Payment.guestId` opcional
   (pagamento por pessoa).
7. ✅ Módulo Retiradas —
   `prisma/migrations/20260814120000_pickup_sessions`: `ServiceSession`
   passa a cobrir também atendimento sem mesa. Adiciona
   `ServiceSession.type` (`ServiceSessionType`: `TABLE`/`PICKUP`),
   `restaurantId` denormalizado (backfill a partir de `table.restaurantId`,
   agora obrigatório e independente de `tableId`), `tableId` opcional,
   campos de retirada (`customerName`, `customerPhone`, `pickupOrigin`,
   `requestedAt`, `pickupNote`, `pickupNumber` sequencial por restaurante
   que nunca reinicia) e reescreve o índice único parcial da seção 4 para
   excluir explicitamente linhas sem mesa.
8. ✅ Pagamento por itens e rateio de consumo (ADR 0006) —
   `prisma/migrations/20260815120000_payment_item_allocations`: nova
   tabela `payment_item_allocations` (liga um `Payment` a uma fatia de um
   `OrderItem` — unidades inteiras ou um valor em R$, com metadado de
   fração quando vem de item dividido), novo enum `AllocationKind`
   (`UNITS`/`AMOUNT`) e `OrderItem.openShareParts` opcional (em quantas
   partes o saldo aberto de um item compartilhado está dividido agora).
   Camada aditiva — não altera `recalculateSessionTotals` nem nenhuma
   tabela financeira existente.

## 7. Fluxo de migration usado na prática

`prisma migrate dev` (que gera SQL automaticamente a partir de um diff do
schema) depende de um "shadow database" temporário. Contra o Postgres do
Supabase (via connection pooler), essa criação falhou de forma consistente
(`P1014`, tabela `_prisma_migrations` não existe no shadow DB — parece
incompatibilidade do pooler com o fluxo de shadow DB do Prisma, não algo
específico do nosso schema).

Fluxo adotado em vez disso, usado desde a migration de RLS (Módulo 0) e
mantido daqui em diante:

1. Editar `prisma/schema.prisma`;
2. Escrever manualmente `prisma/migrations/<timestamp>_<nome>/migration.sql`
   com o SQL equivalente à mudança (`prisma format` + `prisma validate`
   ajudam a conferir o schema, mesmo sem gerar o SQL automaticamente);
3. `npx prisma migrate deploy` — aplica só as migrations pendentes, sem
   precisar de shadow database;
4. `npx prisma generate` para atualizar o client.

Se um dia trocarmos de setup de banco (ou configurarmos um
`shadowDatabaseUrl` separado), voltar a usar `prisma migrate dev`
normalmente é só uma questão de configuração — nenhuma migration já
aplicada precisa mudar.
