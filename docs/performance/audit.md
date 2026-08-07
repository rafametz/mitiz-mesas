# Auditoria de Performance — Caminho Crítico do Atendimento

Data: 2026-08-07. Foco: tempo entre o toque do garçom numa ação (abrir
mesa, enviar pedido, cancelar item) e o feedback visual de sucesso,
principalmente no celular. Nenhum código foi alterado nesta etapa —
só leitura e medição estrutural (contagem de round-trips, não
benchmark cronometrado, que exigiria acesso a métricas reais de
produção que não tenho).

## Atualização (mesmo dia) — a causa dominante era infraestrutura, não código

Depois de implementar as Fases 1–5 abaixo (que continuam válidas e
foram aplicadas), o usuário perguntou especificamente sobre
configuração do Supabase. Investigando isso, medi diretamente onde a
função da Vercel roda de verdade, comparado com onde o banco está:

```
curl -sD - https://mitiz-mesas.vercel.app/api/print-jobs/pending
X-Vercel-Id: gru1::iad1::...
```

Formato do cabeçalho: `<região de entrada>::<região da função>::<id>`.
`gru1` = São Paulo (onde a requisição entra); **`iad1` = Virgínia,
EUA — onde a função de fato executa**. O `DATABASE_URL` já confirmava
o Supabase em `aws-0-sa-east-1` (São Paulo). Ou seja: **toda consulta
ao banco, toda chamada de Auth, toda publicação de tempo real cruza o
Atlântico e volta**, antes mesmo de considerar quantidade de
consultas.

Isso não invalida os achados #1–#8 abaixo (menos idas e vindas
continua sendo certo, e as Fases 1–5 já reduziram a quantidade), mas
explica por que mesmo depois de reduzir a quantidade de consultas
ainda deve sobrar lentidão perceptível: **cada uma das que restam
paga uma travessia intercontinental** (tipicamente 120–180ms só de
ida e volta, antes de qualquer processamento). Com as ~4–6 consultas
síncronas que ainda restam no caminho crítico depois das Fases 1–5
(o que não pôde ser movido pra depois da resposta, ver Fase 2), isso
sozinho já soma quase 1 segundo.

**Correção**: alinhar a região da função da Vercel com a região do
Supabase (`gru1`, São Paulo) — não precisa de banco novo nem migração
de dado nenhuma, é configuração de onde o código roda, não de onde o
dado mora. Registrado em `vercel.json` (`{"regions": ["gru1"]}`) nesta
sessão; **ainda precisa de confirmação/publicação** — ver seção
"Configuração de infraestrutura" no fim deste documento para o
checklist completo do que verificar no painel da Vercel e do Supabase.

## Resumo executivo

O gargalo dominante **não é falta de índice nem query pesada** — o volume
de dados é pequeno (6–8 mesas, um restaurante). É **quantidade de
idas e vindas sequenciais ao banco/serviços externos dentro do caminho
que o garçom espera**, multiplicada por:

1. autenticação sendo verificada 2–3 vezes por requisição (rede real até
   o Supabase Auth, não cache local);
2. a transação de criar pedido fazendo ~12 consultas/escritas
   **sequenciais** (uma depois da outra, não em paralelo) sob o
   isolamento mais caro (`Serializable`);
3. a fila de impressão sendo gravada **dentro** dessa mesma transação;
4. a publicação de tempo real sendo **aguardada** (`await`) antes de
   responder ao navegador, em vez de disparada e esquecida;
5. o fluxo terminando com `redirect()` + `revalidatePath()`, que força
   uma navegação completa e um novo carregamento de página do zero, em
   vez de atualizar o estado local já em mãos;
6. `RealtimeRefresh` disparando `router.refresh()` duas vezes por
   montagem de tela (uma ao assinar o canal, outra a cada evento) —
   ainda mais refetch em cima do que a navegação já causou.

Cada item sozinho é pequeno; somados, no caminho de "enviar pedido",
formam uma cadeia de 15+ idas e vindas de rede **sequenciais** antes do
garçom ver qualquer confirmação — exatamente o padrão que "trava" a
sensação de app rápido no celular, mesmo com poucos dados.

## Achados por severidade

### Crítico

**1. Autenticação verificada 2–3 vezes por requisição, sem cache de
requisição.**
- `src/middleware.ts` → `updateSession()` chama
  `supabase.auth.getUser()` — 1 ida e volta de rede real ao Supabase
  Auth, em **toda** rota não-pública (`src/lib/supabase/middleware.ts:37`).
- `getCurrentUser()` (`src/application/auth/get-current-user.ts:23`)
  cria **outro** cliente Supabase e chama `getUser()` de novo — uma
  **segunda** ida e volta idêntica — mais uma consulta Prisma
  (`User` + `Role` + `Permission` aninhados).
- `getCurrentUser` **não** usa `cache()` do React (diferente de
  `getTableWithActiveSession`, que usa — ver `get-table-with-session.ts:10`).
  Como o layout da mesa (`mesas/[id]/layout.tsx`) chama `requireUser()`
  e a página da aba ativa (ex.: `pedidos/page.tsx`) **também** chama,
  isso roda a consulta completa (rede Supabase + Prisma) **duas vezes
  na mesma requisição**, só para essa uma tela.
- Resultado: uma única navegação para `/mesas/[id]/pedidos` já dispara
  até **3 chamadas de rede ao Supabase Auth** (middleware + layout +
  página) e **2 consultas Prisma idênticas** de usuário — antes de
  qualquer dado da tela em si.
- `getCurrentRestaurant()` (`src/application/restaurant/get-current-restaurant.ts`)
  tem o mesmo problema — chamada em ~29 arquivos, nunca cacheada por
  requisição.

**2. `createOrder` faz ~12 idas e vindas sequenciais ao banco dentro de
uma única transação `Serializable`.**
Contagem em `src/application/order/create-order.ts` (caso mais simples:
1 item, sem pessoa, sem adicional):
1. `order.findUnique` (idempotência)
2. `serviceSession.findUniqueOrThrow` (+ mesa + restaurante)
3. `user.findUniqueOrThrow` (garçom)
4. `product.findMany`
5. `productModifierGroup.findMany`
6. `order.findFirst` (último número de sequência)
7. `order.create` (a escrita real)
8. `recalculateSessionTotals` → `orderItem.findMany` (recomputa **tudo**
   do zero, não só o delta do pedido novo)
9. `recalculateSessionTotals` → `serviceSession.findUniqueOrThrow`
   (**consulta redundante** — a sessão já foi buscada no passo 2, com
   os mesmos dados relevantes)
10. `recalculateSessionTotals` → `serviceSession.update`
11. `createPrintJobsForOrder` → setor + impressora (em paralelo, conta
    como 1)
12. `createPrintJobsForOrder` → `printJob.create`

Com pessoa e/ou adicional selecionado, soma mais 1–2 consultas. Tudo
sob isolamento `Serializable` (o mais propenso a conflito/retry sob
concorrência) e via pooler do Supabase (rede real, não localhost) —
cada ida e volta soma dezenas de milissegundos; 12 delas em série já
é a explicação mais provável de qualquer travamento perceptível ao
enviar pedido, sem precisar de nenhum problema de índice.

**3. Fila de impressão gravada dentro da transação principal — viola o
próprio objetivo do pedido do usuário.**
`createPrintJobsForOrder` (`src/application/printing/create-print-jobs.ts`)
roda dentro da mesma transação `Serializable` de `createOrder` — o
pedido não é considerado "gravado" até a fila de impressão também
terminar de gravar. Não é a impressão física (essa já era assíncrona,
via agente que faz polling), mas é escrita de banco extra acoplada ao
caminho crítico sem necessidade — a criação do `PrintJob` não precisa
da mesma garantia transacional forte que o pedido em si.

**4. `publishChange` (tempo real) é `await`ado antes de responder ao
navegador, em 4 lugares.**
`create-order.ts`, `cancel-order-item.ts`, `update-item-status.ts` e
`open-table.ts` todos fazem `await publishChange(...)` depois da
transação e **antes** de devolver o resultado pra Server Action
retornar ao cliente. `publishChange` (`src/lib/realtime/publish.ts`) é
um `fetch()` real para a API REST de broadcast do Supabase — o garçom
espera essa chamada de rede extra terminar antes de ver "pedido
enviado", mesmo que o pedido já esteja 100% gravado e válido.

### Alto

**5. `RealtimeRefresh` causa refetch duplo a cada montagem de tela.**
`src/components/realtime/realtime-refresh.tsx:27-29`: o canal dispara
`router.refresh()` tanto em `on("broadcast", ...)` quanto no callback de
`subscribe()` quando o status vira `"SUBSCRIBED"`. Toda vez que uma
tela com tempo real monta (ex.: depois do redirect ao enviar pedido),
o React já buscou os dados da rota uma vez (a navegação em si) e,
assim que a inscrição no canal confirma (quase imediato), dispara
**outro** `router.refresh()` — refazendo a consulta inteira da página
de novo, sem nenhum dado ter mudado. Em `/mesas/[id]/pedidos`, isso
dobra a consulta de `prisma.order.findMany` com o include pesado
(`waiter`, `items.modifiers`, `items.guest`, `items.cancelledBy`)
logo depois de já ter acabado de buscar a mesma coisa.

**6. Fluxo de "enviar pedido" termina em navegação completa
(`redirect` + `revalidatePath`), não em atualização local.**
`createOrderAction` (`src/app/(staff)/mesas/[id]/pedidos/actions.ts`)
chama `revalidatePath` duas vezes e depois `redirect()` para a lista de
pedidos — o navegador troca de rota, o servidor re-renderiza a página
de destino do zero (nova consulta com o include pesado citado acima),
e só então o garçom vê a confirmação. Isso é exatamente o oposto do
pedido do usuário: "frontend atualiza imediatamente o estado local da
mesa/comanda" em vez de esperar um novo carregamento de página
completo.

### Médio

**7. `recalculateSessionTotals` sempre recomputa o total inteiro da
comanda, nunca só o delta.**
`src/application/service-session/recalculate-totals.ts` busca **todos**
os itens não cancelados da sessão inteira (com todos os modificadores)
toda vez que qualquer coisa muda — em vez de somar só o item novo (ou
subtrair o item cancelado) ao valor já em cache. Inofensivo hoje (poucos
itens por mesa), mas é trabalho redundante que cresce com o tempo de
mesa aberta, e é uma das idas e vindas sequenciais dentro da transação
crítica (achado #2).

**8. Índice composto ausente em `ServiceSession`.**
`prisma/schema.prisma` tem `@@index([tableId])` e `@@index([status])`
separados em `ServiceSession`, mas a consulta mais comum do sistema
(`getTableWithActiveSession`, chamada em quase toda tela) filtra pelos
dois **juntos** (`tableId` + `status IN (...)`). Com 6–8 mesas isso não
é perceptível hoje, mas é a única lacuna de índice real encontrada —
correção barata, sem risco, vale fazer mesmo sem impacto medido ainda.

### Baixo / descartado (verificado, sem achado)

- **Logs de desenvolvimento excessivos**: não encontrado. Só existem
  `console.error` em pontos de falha real (nunca `console.log` solto em
  código de produção) — checado em `src/app`, `src/application`,
  `src/lib`.
- **Dependência indevida de testes E2E em execução normal**: não
  encontrado. Nenhuma referência a `NODE_ENV`/`E2E_TEST_*` fora de
  `src/lib/prisma.ts` (que só ajusta nível de log/reuso de conexão em
  dev, padrão recomendado pelo Prisma) e do próprio `scripts/`
  isolado. Nada em `middleware.ts` ou nas rotas de API depende de
  estado de teste.
- **N+1 clássico (query por item de uma lista)**: não encontrado nas
  telas do garçom — as listagens usam `include`/`findMany` únicos, não
  loop de consulta por item.
- **Serialização excessiva**: não é um problema real hoje — os payloads
  trafegados (pedido, itens) são pequenos; o Decimal do Prisma já é
  convertido antes de virar HTML pelo Server Component, sem camada
  extra de serialização manual.

## Por que isso explica "lento no celular"

O celular do garçom soma dois fatores que pioram tudo acima: rede móvel
com latência mais alta e menos previsível que Wi-Fi/cabo, e cada
milissegundo de ida-e-volta sendo sentido de forma mais literal numa
tela pequena onde não há mais nada acontecendo visualmente enquanto
espera. 15+ idas e vindas sequenciais que seriam ~300ms numa rede boa
viram 1–3s numa rede 4G mediana — e o app não mostra nada além do texto
"Enviando pedido..." durante todo esse tempo.

## Estratégia proposta (sem mudar regra de negócio)

Ver `docs/performance/optimization-plan.md` para o plano fase a fase.
Princípio geral, já confirmado como seguro pelos próprios achados: nada
aqui exige mudar o que é validado, quem pode fazer o quê, ou como o
dinheiro é calculado — só a **ordem e o momento** em que cada trabalho
acontece, e quantas vezes.

## Configuração de infraestrutura (Vercel + Supabase)

Resposta direta à pergunta "o que dá pra mudar no Supabase" — nem tudo
que parecia lentidão de rede era do Supabase.

### 1. Região da função (Vercel) — a correção de maior impacto, feita fora do Supabase

Já registrada em `vercel.json` nesta sessão (`{"regions": ["gru1"]}`),
ainda **não publicada**. Depois de publicar, confirmar no painel da
Vercel (Project → Settings → Functions → "Function Region") que ficou
`São Paulo, Brazil (gru1)` — em alguns planos/setups o valor do painel
tem prioridade sobre o `vercel.json`, então vale checar os dois. Sem
isso, o `vercel.json` sozinho pode não ter efeito.

Como conferir depois de publicar (mesmo comando usado pra descobrir o
problema):
```bash
curl -sD - -o /dev/null https://mitiz-mesas.vercel.app/api/print-jobs/pending | grep -i x-vercel-id
```
Precisa aparecer `gru1::gru1::...` (as duas partes iguais) — hoje
aparece `gru1::iad1::...`.

### 2. Supabase — o que já está correto (conferido, não precisa mudar)

- **Pooler**: `DATABASE_URL` já usa a porta 6543 (modo transação,
  `pgbouncer=true`) — o modo certo pra função serverless, evita
  esgotar conexão. `DIRECT_URL` na porta 5432 (modo sessão) só pra
  migration, também correto.
- **Região do projeto**: `sa-east-1` (São Paulo) — já é a escolha
  certa pra um restaurante no Brasil; não precisa mudar nem recriar.
- **Um projeto Supabase dedicado a este sistema** (confirmado pelo
  usuário) — não há outro projeto/cliente disputando a mesma instância.
  O único "compartilhamento" que existia era **dev local e produção
  usando o mesmo banco dentro deste projeto** (documentado desde a ADR
  0002) — isso é uma decisão de custo/simplicidade do MVP, não um
  problema de performance; é uma fonte separada de risco (dado de
  teste podendo aparecer em produção), já mitigada com os scripts de
  limpeza existentes.

### 3. Supabase — vale conferir, sem trocar nada às cegas

- **Tier de compute** (Project Settings → Compute): se estiver no
  menor tier gratuito, é normal ter mais fila sob concorrência real
  (vários garçons ao mesmo tempo em um sábado cheio, por exemplo) —
  mas não é a causa da lentidão sentida hoje com poucas mesas; corrigir
  a região primeiro e só depois reavaliar se ainda sobrar lentidão sob
  carga real.
- **Pausa por inatividade** (só existe no tier gratuito): projeto
  gratuito sem uso "dorme" depois de alguns dias parado, e a primeira
  requisição depois disso demora bem mais (o projeto precisa
  "acordar"). Só relevante se o sintoma for "trava por vários segundos
  raramente", não "sempre um pouco lento".

### 4. Por que **não** criar um banco novo / migrar dado

Recriar o banco no Supabase, na mesma região (`sa-east-1`), não muda
nada — o gargalo está em onde a *função* roda, não em onde o *banco*
está. Migrar dado é trabalho e risco reais (histórico de atendimento,
auditoria) sem nenhum ganho de performance nesse cenário específico.
Só faria sentido recriar o banco numa região diferente se a decisão
fosse *mover a função pra outra região* — o que não é o caso aqui,
já que `sa-east-1` já é a escolha certa pra este negócio.
