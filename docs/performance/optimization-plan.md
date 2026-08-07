# Plano de Otimização — Caminho Crítico do Atendimento

Baseado em `docs/performance/audit.md`. Nenhum item muda regra de
negócio, cálculo financeiro, permissão ou validação — só a ordem, o
momento e a quantidade de trabalho de rede/banco no caminho que o
garçom espera. Idempotência (regra 18/19 do CLAUDE.md) é preservada em
todas as fases: a chave de idempotência continua sendo checada dentro
da mesma transação que grava o pedido, nunca depois.

Primitivo usado para "processo secundário que não bloqueia a resposta":
`after()` de `next/server` (Next.js 15, já instalado nesta versão) —
agenda um callback pra rodar depois da resposta já ter sido entregue ao
navegador, com garantia da plataforma (Vercel) de que ele roda até o
fim mesmo a função serverless já tendo "respondido". É o jeito correto
de fazer isso nesta stack — uma Promise só "solta" sem `await` corre o
risco de ser interrompida assim que a função retorna.

## Fase 1 — Deduplicar autenticação e restaurante por requisição (crítico, risco zero)

Envolver `getCurrentUser` e `getCurrentRestaurant` em `cache()` do
React, mesmo padrão já usado em `getTableWithActiveSession`. Isso não
muda nenhuma regra — só evita repetir a mesma consulta (rede Supabase +
Prisma) quando mais de um componente da mesma requisição pede o mesmo
dado. Reduz de até 3 pra 1 chamada de autenticação por navegação em
telas com layout + página (ex.: `/mesas/[id]/pedidos`).

Arquivos: `src/application/auth/get-current-user.ts`,
`src/application/restaurant/get-current-restaurant.ts`.

## Fase 2 — Parar de aguardar tempo real e impressão antes de responder (crítico)

- `publishChange` (tempo real) passa a rodar via `after()` em vez de
  `await` direto, nos 4 lugares que chamam: `create-order.ts`,
  `cancel-order-item.ts`, `update-item-status.ts`, `open-table.ts`. O
  pedido/cancelamento/mudança de status já está gravado e válido antes
  disso rodar — hoje o garçom espera essa chamada de rede extra à toa.
- `createPrintJobsForOrder` sai de dentro da transação `Serializable`
  principal de `createOrder` e passa a rodar depois do commit, também
  via `after()` — mantendo o padrão que `open-table.ts` já usa pra
  `publishChange` ("efeito colateral não crítico não entra na
  transação de negócio"). Mesmo tratamento em `cancel-order-item.ts`
  pro `PrintJob` de tipo `CANCELLATION`.
- Risco real e como fica coberto: se a criação do `PrintJob` falhar
  depois do pedido já confirmado (rede, timeout), o pedido continua
  válido, mas aquele setor não teria ticket. Mitigado com try/catch +
  log claro dentro do `after()` (mesmo padrão que `publishChange` já
  usa) — não eliminamos o risco por completo, mas ele já existia de
  forma equivalente na impressão física em si (sempre foi assíncrona,
  com fila de reprocessamento). Documentar isso continua CLAUDE.md
  seção 20 ("criar estratégia de reprocessamento").

Arquivos: `src/application/order/create-order.ts`,
`src/application/order/cancel-order-item.ts`,
`src/application/production/update-item-status.ts`,
`src/application/service-session/open-table.ts`.

## Fase 3 — Corrigir refresh duplicado do tempo real (alto, risco baixo)

`RealtimeRefresh` chama `router.refresh()` tanto ao receber um evento
quanto ao confirmar a inscrição no canal (`status === "SUBSCRIBED"`).
O segundo é redundante — toda montagem de tela já buscou os dados uma
vez pela navegação normal. Remove o refresh no `SUBSCRIBED`, mantém só
no evento de broadcast de verdade.

Arquivo: `src/components/realtime/realtime-refresh.tsx`.

## Fase 4 — Resposta imediata sem navegação completa ao enviar pedido (alto)

Hoje `createOrderAction` faz `revalidatePath` (2x) + `redirect()`,
forçando o Next.js a buscar a página de destino do zero (nova consulta
com include pesado). Troca por: a action devolve o pedido recém-criado
no próprio estado do `useActionState` (sem redirecionar no servidor); o
componente cliente usa esse retorno pra navegar (`router.push`, client-
side) e mostrar o toast de sucesso imediatamente — o servidor não
precisa mais re-renderizar a página de pedidos antes do garçom ver a
confirmação. A navegação em si ainda busca a lista atualizada (Next.js
sempre busca o payload da rota ao navegar — isso não muda), mas deixa
de haver um `redirect()` do servidor bloqueando a resposta da própria
ação de criar o pedido.

Arquivos: `src/app/(staff)/mesas/[id]/pedidos/actions.ts`,
`.../pedidos/novo/new-order-form.tsx`.

## Fase 5 — Reduzir consultas dentro da transação de criar pedido (médio)

- `recalculateSessionTotals`: evitar a consulta redundante de
  `serviceSession` (já buscada por `createOrder` antes de chamar essa
  função) — passar os valores já em mãos em vez de buscar de novo.
  Recalcular tudo do zero (em vez de somar só o delta) fica como está
  por enquanto — mexer nisso é risco desproporcional ao ganho no volume
  de dados atual (poucos itens por mesa); revisar se o volume crescer.
- Índice composto `@@index([tableId, status])` em `ServiceSession` —
  sem impacto medido hoje, mas é a consulta mais repetida do sistema
  (`getTableWithActiveSession`) e o custo de adicionar é zero.

Arquivos: `src/application/service-session/recalculate-totals.ts`,
`prisma/schema.prisma` (+ migration).

## O que fica de fora deste plano, de propósito

- Reescrever o carrinho do "Novo pedido" pra estado totalmente
  otimista (mostrar o item na comanda antes mesmo do servidor
  confirmar) — o pedido do usuário já é atendido com resposta rápida
  do servidor (Fases 1–4); ir além disso é redesenho de UX que não foi
  pedido e adiciona risco de mostrar dado desatualizado.
- Trocar `Serializable` por isolamento mais fraco na transação de
  criar pedido — é o que garante a regra "uma mesa, um atendimento" e
  a numeração sequencial correta sob concorrência (CLAUDE.md "tratar
  concorrência"); reduzir isolamento é mudar garantia de negócio, fora
  do escopo desta auditoria.
- Qualquer coisa em `/admin` — o pedido do usuário é especificamente
  sobre o app do garçom no celular.

## Ordem de execução e validação

Fases 1–3 são independentes entre si e de baixo risco — executar em
sequência, validando com `tsc`/lint/testes depois de cada uma. Fase 4
depende de nada, mas é a que mais toca comportamento observável
(precisa de atenção redobrada aos textos/seletores do E2E). Fase 5 é
independente, pode ser feita a qualquer momento.

Testes: suíte de integração de `create-order.test.ts` e
`cancel-order-item.test.ts` cobre que o pedido continua correto,
idempotente e com total certo — só o *timing* de efeitos colaterais
muda, então essa suíte é o principal sinal de "nada quebrou". E2E de
`pedidos.spec.ts` confirma o fluxo real ponta a ponta continua
funcionando.
