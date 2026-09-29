# ADR 0008 — Módulo Reservas de Assados: domínio independente

- **Status**: Aceita
- **Data**: 2026-09-29
- **Relacionada**: `docs/backlog.md`, CLAUDE.md (seção 4, "fora do MVP" —
  este módulo é uma extensão explicitamente pedida depois do MVP, não uma
  revisão de escopo do MVP em si)

## Contexto

A MITIZ controlava reservas de carnes assadas por encomenda (côstela de
boi, côstela BBQ, panceta, cupim, maionese, maminha) em planilha Excel,
sujeita a erro humano e sem controle de disponibilidade em tempo real. O
usuário pediu um módulo novo para substituir a planilha, com um requisito
central explícito: **este módulo não pode ocupar mesa, não pode gerar
comanda, não pode gerar venda de PDV e não pode acionar impressão de
cozinha** — é só um controle de disponibilidade e pré-encomenda por dia,
sem tocar em nenhum fluxo já existente de mesa/pedido/pagamento.

Duas abordagens foram consideradas:

1. Reaproveitar `ServiceSession`/`Order`/`OrderItem` de algum jeito (por
   exemplo, um `ServiceSessionType.RESERVATION` novo, análogo ao que o
   módulo Retiradas fez para `PICKUP` — ver ADR 0005);
2. Um domínio inteiramente novo e paralelo, sem nenhuma relação com
   `Table`/`ServiceSession`/`Order`.

Diferente do módulo Retiradas (que é genuinamente "um atendimento sem
mesa" e por isso reaproveitou toda a engrenagem financeira/de impressão já
testada), reserva de assado **não é um atendimento**: não tem comanda, não
tem pagamento neste v1, não tem status de preparo/pronto/entregue por
setor, não aciona impressão nenhuma. Forçar isso dentro de
`ServiceSession` exigiria uma cascata de `if (type === "ROAST")` em código
que hoje assume "toda sessão pode virar pedido, pagamento e impressão" —
justamente o requisito de independência que o usuário pediu para evitar.

## Decisão

Opção 2. Cinco modelos novos, sem nenhuma alteração em tabela existente:

- `RoastProduct` — catálogo (nome, unidade livre como "kg"/"un", sem
  preço: este módulo não vende nada, só reserva);
- `RoastProductionDay` — um dia configurado pelo Administrador
  (`date` como `"AAAA-MM-DD"`, mesma convenção de dia civil em
  America/Sao_Paulo já usada em `date-range.ts`, nunca um `DateTime`, para
  não introduzir ambiguidade de fuso num conceito que é só "dia");
- `RoastProduction` — quantidade planejada de um produto num dia, com
  `reservedQuantity` em cache (mesmo racional de
  `ServiceSession.subtotalAmount`: sempre recalculado do zero dentro da
  transação que mudou algo, nunca incrementado/decrementado por delta);
- `RoastReservation` — cabeçalho da reserva do cliente (nome, telefone
  opcional, status `PENDING`/`DELIVERED`/`CANCELLED`, `idempotencyKey`
  única — regra 18/19 do CLAUDE.md, mesmo padrão de `Order`);
- `RoastReservationItem` — itens da reserva, com nome/unidade congelados
  no momento da reserva (mesmo racional de
  `OrderItem.productNameAtOrder`).

Concorrência (evitar overbooking — requisito central do usuário): criar e
editar reserva rodam numa transação `Serializable` com retry até 3
tentativas em conflito, **exatamente o mesmo padrão comprovado em
`create-order.ts`** (`maxWait: 5000`, `timeout: 15000`,
`isRetryableConflict` checando `P2002`/`P2034`/`P2028` e a mensagem de
serialização do Postgres). A disponibilidade é sempre
`plannedQuantity - reservedQuantity`, validada dentro da própria transação
antes de gravar — nunca confiada do cliente.

Permissões novas (`roasts.view`/`roasts.create`/`roasts.edit`/
`roasts.deliver`/`roasts.cancel`), sem código próprio para configurar
produção por dia: essa configuração vive inteiramente em `/admin`, já
protegido por `admin.manage`. Decisões de fluxo (proposta aprovada pelo
usuário 2026-09-29):

- Garçom cancela reserva `PENDING` direto, sem autorização do admin
  (diferente do fluxo de cancelamento de pedido de mesa, que tem
  solicitar/autorizar separados) — sempre com motivo obrigatório;
- `DELIVERED` é definitivo no v1: sem reabertura, sem editar, sem
  cancelar depois de entregue;
- Caixa só enxerga (`roasts.view`), sem criar/editar/entregar/cancelar;
- Navegação: aba própria "Reservas" na barra inferior do app do garçom
  (não aninhada como aba irmã de Mesas, diferente de como Retiradas foi
  encaixada) — decisão explícita do usuário, o módulo é conceitualmente
  separado de atendimento de mesa.

## Fora de escopo (decisão explícita do usuário, 2026-09-29)

Integração automática com VHSYS, cobrança/pagamento de sinal, controle de
custo, controle de estoque por peso real, notificação por WhatsApp,
impressão automática de comprovante, controle de entrega/logística,
relatórios financeiros complexos. Este módulo é só disponibilidade +
pré-encomenda por dia.

## Consequências

- Nenhuma tabela existente foi alterada — módulo inteiramente aditivo
  (migrations `20260929120000_roast_reservations` e
  `20260929121500_roast_reservation_idempotency_key`);
- RLS deny-by-default habilitado nas 5 tabelas novas, mesmo racional da
  migration `20260804194913_enable_rls_deny_by_default` (o Prisma conecta
  como dono, não é afetado; a API pública do Supabase fica bloqueada por
  padrão);
- Sem valor financeiro em lugar nenhum do domínio — `RoastReservationItem`
  guarda só quantidade, nunca preço; se um dia isso mudar (ex.: cobrança
  de sinal), é uma extensão nova, não uma correção deste desenho;
- `recalculateReservedQuantity` (application/roast/recalculate-reserved.ts)
  é o mesmo padrão de `recalculateSessionTotals`: recomputa do zero a
  partir da soma dos itens ativos, nunca confia em incrementos anteriores
  — imune a drift mesmo se uma edição/cancelamento falhar no meio.
