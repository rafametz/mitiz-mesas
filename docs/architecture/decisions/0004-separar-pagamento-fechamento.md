# ADR 0004 — Separar PAGAMENTO de FECHAMENTO DO ATENDIMENTO

- **Status**: Aceita
- **Data**: 2026-08-10
- **Relacionada**: Módulo 8 (`docs/backlog.md`), business-rules.md §6

## Contexto

Relato real de uso: ao tentar fechar uma mesa, o fluxo travava. Investigando,
a causa era estrutural, não um bug pontual — `registerPayment` só era
permitido depois de `requestClosing` (`canRegisterPayment` exigia
`WAITING_CLOSING`/`PARTIALLY_PAID`) e, ao registrar qualquer pagamento,
sempre gravava `PARTIALLY_PAID` ou `PAID` em `ServiceSession.status` **e**
`Table.status` (`statusAfterPayment`). Como `createOrder` bloqueia pedido
novo fora de `status === "OPEN"`, um único pagamento parcial no meio do
atendimento — cenário normal (uma pessoa paga a parte dela e vai embora,
as outras continuam) — bloqueava permanentemente novo pedido na mesa, sem
que ninguém tivesse pedido o fechamento.

Adicionalmente, `PAID` nunca esteve em `ACTIVE_SERVICE_SESSION_STATUSES` —
uma sessão que chegasse a `PAID` sem passar por `closeTable` ficava órfã
(nem bloqueava pedido novo por completo, nem contava como "mesa ocupada"
para o índice único de "uma mesa, um atendimento ativo"). Confirmado em
produção durante esta mesma revisão: a Mesa 1 tinha uma sessão `PAID`
nunca finalizada, e o app permitiu abrir uma segunda sessão por cima —
exatamente o "saldo zero virando mesa encerrada sozinha" que o relato
original também apontava.

## Decisão

Pagamento e fechamento do atendimento são ações e conceitos
independentes:

- `ServiceSession.status` passa a ter só 5 valores: `OPEN`, `CLOSING`
  (renomeado de `WAITING_CLOSING`), `CLOSED`, `REOPENED`, `CANCELLED`.
  `PARTIALLY_PAID`/`PAID` saem do enum — eram informação derivada
  (`paidAmount`/`balanceAmount`), não estado que deveria controlar regra;
- `registerPayment`/`voidPayment` **nunca** escrevem
  `ServiceSession.status` ou `Table.status` — só recalculam os totais em
  cache via `recalculateSessionTotals` (que já era, e continua sendo, a
  única fonte dos valores exibidos, independente de status);
- `canRegisterPayment(status)` passa a aceitar `OPEN` **e** `CLOSING`
  (antes só o equivalente a `WAITING_CLOSING`/`PARTIALLY_PAID`) —
  pagamento é possível assim que existe consumo, não só depois de pedir a
  conta;
- `canModifyClosingCharges` (taxa de serviço, desconto) continua exigindo
  `CLOSING` — decisão confirmada com o usuário: taxa/desconto continuam
  sendo passos do fechamento da conta, só pagamento sai desse
  pré-requisito;
- `canCloseTable` passa a exigir `status === "CLOSING"` **e** saldo zero
  (era `PAID` + saldo zero) — fechar continua sendo uma ação explícita
  separada (`closeTable`), nunca um efeito colateral de saldo chegar a
  zero;
- Nova transição `CLOSING → OPEN` (`cancelClosingRequest`) — decisão
  confirmada com o usuário: quem solicitou o fechamento pode desistir sem
  precisar fechar e reabrir o atendimento inteiro (`CLOSED → REOPENED`,
  operação bem mais pesada, só admin);
- Pagamento por pessoa: `Payment.guestId` (opcional — `null` continua
  sendo pagamento geral da mesa) e `Guest.status`
  (`ACTIVE`/`SETTLED`). Marcar uma pessoa como quitada é manual (decisão
  confirmada com o usuário: sem cálculo obrigatório bloqueando a ação) —
  `deriveGuestParticipation` só calcula consumo/pago/saldo por pessoa
  para exibição, nunca decide `SETTLED` sozinho. Pessoa `SETTLED` some
  por padrão do seletor de "pessoa" ao lançar item novo; nada do que já
  foi lançado pra ela é apagado ou desvinculado.

## Migração de dados (banco único, dev = produção)

Este projeto não tem banco de dev separado — qualquer migration roda
contra o mesmo Postgres usado em produção. A migration
(`20260810160849_separate_payment_from_closing`) trata os dados
existentes antes de remover os valores do enum:

- Sessão em `PARTIALLY_PAID`/`PAID` cuja mesa já tem outra sessão ativa
  por cima (o bug órfão descrito acima) → `CLOSED`, com `closedAt` e uma
  entrada de auditoria (`service_session.closed_by_migration`)
  explicando o motivo — nunca silenciosa;
- Senão, se já tinha auditoria de `service_session.closing_requested` →
  `CLOSING`;
- Senão → `OPEN` (nunca deveria ter saído de lá).

Confirmado antes de aplicar: só 1 sessão real era afetada (a mesma do
relato de bug); nenhuma outra mesa tinha conflito.

## Consequências

- `PARTIALLY_PAID` também sai de `TableStatus` — a mesma informação
  (pagamento parcial) já era e continua sendo calculada na tela `/mesas`
  a partir de `paidAmount`/`totalAmount`, nunca precisou ser um estado
  gravado;
- Telas que dependiam do fechamento estar solicitado para mostrar o bloco
  de pagamento (`/mesas/[id]/pagamentos`) passam a mostrar pagamento
  sempre que existe atendimento ativo, com o bloco de fechamento
  (taxa/desconto/finalizar) visualmente separado e só habilitado em
  `CLOSING`;
- Testes de integração de fechamento reescritos para cobrir o cenário
  relatado (pagamento parcial em `OPEN` não bloqueia pedido novo, saldo
  recalculado dinamicamente) e a rejeição de `closeTable` fora de
  `CLOSING` mesmo com saldo zero.
