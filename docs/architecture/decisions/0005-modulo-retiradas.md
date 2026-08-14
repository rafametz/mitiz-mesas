# ADR 0005 — Módulo Retiradas: atendimento sem mesa

- **Status**: Aceita
- **Data**: 2026-08-14
- **Relacionada**: `docs/backlog.md`, CLAUDE.md (regra 1, seção 7)

## Contexto

A MITIZ também recebe pedidos avulsos para retirada (cliente no balcão,
WhatsApp ou telefone que vem buscar depois), sem ocupar mesa física. Até
aqui, todo o sistema assumia que "atendimento" e "mesa" eram a mesma
coisa: `ServiceSession.tableId` era obrigatório, e praticamente toda regra
de negócio (regra 1 do CLAUDE.md, impressão, pagamento, fechamento,
auditoria) derivava dados através de `ServiceSession → Table →
Restaurant`.

Duas abordagens foram consideradas:

1. Criar um modelo paralelo (`PickupOrder` + tabelas próprias de item,
   pagamento, impressão) — duplicaria toda a lógica financeira e de
   impressão já existente e testada;
2. Generalizar `ServiceSession` para representar "um atendimento",
   mesa ou retirada, reaproveitando `Order`/`OrderItem`/`Payment`/
   `Discount`/`ServiceCharge`/`PrintJob` sem nenhuma mudança de schema
   nessas tabelas (todas já se relacionam só por `serviceSessionId`).

## Decisão

Opção 2. `ServiceSession` passa a ter:

- `type: ServiceSessionType` (`TABLE` | `PICKUP`, default `TABLE`);
- `tableId` opcional (só preenchido quando `type = TABLE`);
- `restaurantId` denormalizado diretamente na sessão (antes só existia via
  `table.restaurantId`) — necessário porque retirada não tem mesa para
  derivar isso;
- Campos específicos de retirada, todos opcionais e nulos em atendimento
  de mesa: `customerName`, `customerPhone`, `pickupOrigin`,
  `requestedAt` (horário previsto), `pickupNote`, `pickupNumber`
  ("RETIRADA #047" — sequencial por restaurante, decisão do usuário:
  nunca reinicia, mesmo padrão de cálculo de `Order.sequenceNumber`,
  dentro da transação com retry em conflito).

Consequências diretas no código:

- O índice único parcial de "uma mesa, um atendimento ativo" (regra 1)
  passa a excluir explicitamente `tableId IS NULL` — a regra nunca se
  aplicou (nem deveria) a retirada: várias retiradas convivem
  normalmente ao mesmo tempo;
- Toda função de aplicação que lia `session.table.restaurantId` passa a
  ler `session.restaurantId` direto, e todo `tx.table.update(...)` fica
  condicionado a `if (session.tableId)` — nenhuma mudança de
  comportamento para mesa, só deixa de assumir que ela sempre existe;
- `sessionRealtimeChannels(session)` centraliza a escolha entre canal de
  mesa (`table:{id}` / `restaurant:{id}:tables`) e canal de retirada
  (`pickup:{id}` / `restaurant:{id}:pickups`), usada por toda mutação
  financeira/de pedido;
- Ticket impresso (`ticket.ts`/`bill-summary.ts`) ganha um cabeçalho
  alternativo (`pickup: { number, customerName, customerPhone,
  requestedTimeLabel }`) no lugar de `tableNumber`, deixando "RETIRADA
  #047" evidente no papel — sem novo `PrintJobType`, sem novo fluxo de
  status (nenhum "em preparo"/"pronto" para retirada, decisão explícita
  do usuário: escopo mínimo nesta primeira versão);
- Ações de pedido/pagamento/fechamento que antes recebiam `tableId` só
  para `revalidatePath`/redirecionar passam a receber um `redirectPath`
  genérico (`/mesas/{id}` ou `/retiradas/{id}`) — o mesmo componente de
  carrinho (`NewOrderForm`) e os mesmos 7 formulários/botões de
  pagamento (fechamento, taxa, desconto, pagamento, estorno) atendem os
  dois fluxos sem duplicação;
- Navegação: `/mesas` e `/retiradas` são abas irmãs (`AtendimentoTabs`),
  mesmo padrão já usado em Histórico/Auditoria — não um novo ícone na
  barra inferior (CLAUDE.md seção 11);
- Permissão: reaproveita `TABLES_OPEN` para abrir retirada — hipótese
  reversível confirmada com o usuário, sem criar código de permissão
  novo só para isso.

## Fora de escopo (decisão explícita do usuário, 2026-08-14)

Status de preparo/pronto/entregue específico de retirada, painel de
cozinha dedicado (os itens de retirada aparecem no `/producao` normal,
junto com os de mesa), delivery, rastreamento, integração com WhatsApp,
notificações ao cliente.

## Consequências

- Nenhuma tabela nova além dos campos adicionados em `service_sessions`
  (migration `20260814120000_pickup_sessions`) — todo o restante do
  domínio financeiro/impressão é 100% reaproveitado;
- `AuditLog` continua sem um campo próprio de "pickup id" (só
  `tableId`, nulo para retirada) — ações auditadas de uma retirada
  aparecem na aba Auditoria sem link clicável de volta pro atendimento;
  aceitável nesta primeira versão, mesmo padrão que qualquer outra
  entrada de auditoria sem mesa já tinha;
- Testes de integração dedicados (`tests/integration/pickup.test.ts`)
  cobrem numeração sequencial, pedido/impressão/cancelamento/pagamento/
  fechamento sem mesa.
