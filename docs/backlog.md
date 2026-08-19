# Backlog — MITIZ Mesas

Plano de implementação dividido em módulos pequenos, seguindo a ordem de
prioridade da seção 23 do `CLAUDE.md`. Cada módulo deve, ao final, deixar o
sistema executável (seção 16). Decisões técnicas (tempo real, hospedagem,
impressão, banco, autenticação, multi-unidade) já estão confirmadas — ver
[architecture/overview.md](architecture/overview.md#2-decisões-confirmadas),
[ADR 0001](architecture/decisions/0001-decisoes-tecnicas-iniciais.md) e
[ADR 0002](architecture/decisions/0002-adocao-supabase.md) (banco,
autenticação e tempo real via Supabase).

Critério de "concluído" por módulo: seção 22 do `CLAUDE.md` (regra de
negócio atendida, validado, permissões respeitadas, funciona em mobile/desktop
quando aplicável, erros tratados, testes adequados, não quebra fluxo
existente, lint/typecheck ok, testado no fluxo real).

## Módulo 0 — Fundação do projeto

- Inicializar repositório Git e Next.js (TypeScript, App Router, Tailwind);
- Configurar ESLint, Prettier, Vitest, Playwright (esqueleto sem testes ainda);
- Configurar Prisma + Postgres local via Docker Compose;
- `.env.example` com todas as variáveis necessárias, sem segredos reais;
- CI mínimo (lint + typecheck + testes) — se houver plataforma de CI definida.
- **Saída**: projeto roda localmente (`npm run dev`), lint/typecheck passam,
  Postgres sobe via Docker.

## Módulo 1 — Autenticação e permissões ✅

- ✅ Projeto Supabase criado e RLS habilitado em todas as tabelas (Módulo 0);
- ✅ Catálogo de permissões e mapeamento por perfil, regra pura testada
  ([src/domain/auth/permissions.ts](../src/domain/auth/permissions.ts));
- ✅ Seed de referência: `Restaurant`, 4 `Role`, `Permission`,
  `RolePermission` (`prisma/seed.ts`, idempotente);
- ✅ Login com e-mail/senha via Supabase Auth; ao autenticar, resolve o
  `User` da aplicação a partir do `authUserId` da sessão
  ([src/application/auth/get-current-user.ts](../src/application/auth/get-current-user.ts));
- ✅ Middleware de proteção de rota — exige sessão válida em toda rota
  exceto `/login` (`src/middleware.ts`). Restrição por perfil/permissão
  específica é aplicada rota a rota conforme as telas de cada módulo forem
  criadas — o mecanismo (`hasPermission`/`hasAnyPermission`) já existe;
- ✅ Tela de login mobile-first (`src/app/login/`) + logout;
- **Testes**: 9 testes unitários da regra de permissão por perfil
  (`tests/unit/permissions.test.ts`); E2E de login válido/inválido e
  logout (`tests/e2e/login.spec.ts`) — requer `E2E_TEST_USER_EMAIL`/
  `E2E_TEST_USER_PASSWORD` no `.env` (impressos por `npm run prisma:seed`).
- **Saída**: usuário autentica via Supabase e vê seu nome/perfil na home;
  testado manualmente de ponta a ponta e via E2E automatizado.

### Como usar

- `npm run prisma:seed` — cria dados de referência + 1 usuário de teste
  (credenciais impressas no terminal, perfil Admin, **não é conta real**);
- `npm run auth:link-admin -- --email=voce@exemplo.com --name="Seu Nome"`
  — depois de criar seu usuário real em
  _Supabase → Authentication → Users → Add user_, vincula-o ao perfil
  Administrador sem o script nunca ver sua senha.

### Bloqueio de rota por perfil/permissão específica — ainda não testado

O mecanismo (`hasPermission`) está pronto e testado isoladamente, mas só
faz sentido testar "bloqueio de rota sem permissão" contra rotas reais, que
ainda não existem (chegam nos Módulos 2+). Revisitar esse item do backlog
quando a primeira rota com restrição por perfil for criada.

## Módulo 2 — Cadastros básicos (Administração) ✅

- ✅ Telas de administração (`/admin/*`), protegidas por
  `requirePermission(ADMIN_MANAGE)` no layout — checagem no backend, não só
  esconder link;
- ✅ `ProductionSector`, `Category`, `Table`, `Product` — listar, criar,
  editar (nunca exclusão definitiva: usa `active`/`status` em vez de
  delete, consistente com o resto do projeto);
- ✅ Disponibilidade de produto (`available`) com atalho de 1 clique na
  listagem, sem precisar abrir o formulário completo;
- ✅ `ProductModifierGroup`/`ProductModifier` — gerenciados dentro da edição
  do produto (só fazem sentido no contexto de um produto). Migration extra:
  `ProductModifierGroup.active` (não existia, adicionado por consistência
  com `ProductModifier`);
- Preço do produto congela no `OrderItem.unitPrice` no momento do
  lançamento (regra 9/10) — já garantido pelo schema desde o Módulo 0; o
  teste de ponta a ponta (alterar preço não muda pedido já lançado) só é
  possível a partir do Módulo 4, quando `Order`/`OrderItem` existirem.
- **Testes**: E2E cobrindo criação de setor, categoria, mesa e produto
  (com categoria/setor reais, alternância de disponibilidade, criação de
  grupo de adicionais e adicional) — `tests/e2e/admin.spec.ts`, 4 testes.
- **Saída**: admin cadastra mesas, setores, categorias, produtos e
  adicionais pelo navegador.

### Bug real encontrado e corrigido durante os testes

Os componentes de campo (`src/components/admin/field.tsx`) geravam
`id={name}` diretamente. Como a página de edição de produto tem vários
mini-formulários com campos de mesmo `name` (produto, grupo de
adicionais, cada adicional — todos têm um campo "nome"), os `id`s
colidiam e o `<label>` associava ao input errado (bug real de
acessibilidade/HTML inválido, não só do teste). Corrigido trocando para
`useId()` do React, que gera um id único por instância do componente.

### Não coberto neste módulo (registrado, não esquecido)

Bloqueio de `/admin` para um usuário sem permissão `admin.manage` (ex.:
Garçom, Produção) não tem teste automatizado ainda — só existe um usuário
de teste (perfil Admin). A lógica (`hasPermission`) está testada
isoladamente; o teste de ponta a ponta do bloqueio fica para quando
houver mais de um perfil de teste com necessidade real de login (ex.:
telas de garçom/produção nos próximos módulos).

## Módulo 3 — Mesas e atendimentos ✅

- ✅ Domínio puro testado: máquina de estados de `ServiceSession`
  (`src/domain/service-session/states.ts`) e regra "só abre mesa livre"
  (`src/domain/table/states.ts`);
- ✅ `openTable` transacional (`src/application/service-session/open-table.ts`)
  — mesa, pessoas, responsável opcional, nomes opcionais, garçom
  responsável; duas camadas de defesa da regra 1 (checagem de status dentro
  da transação + índice único parcial do banco como rede de segurança);
- ✅ Visão de mesas (`/mesas`) — cards com número, status, horário de
  abertura, tempo decorrido, pessoas, garçom. Valor parcial / alerta de
  pedido pronto / indicação de pagamento parcial ficam de fora até os
  Módulos 4/6/8 existirem — sem dado inventado;
- ✅ Tela da mesa (`/mesas/[id]`) — cabeçalho + abas (Comanda, Pessoas,
  Pedidos, Pagamentos, Histórico). Comanda e Pessoas com dado real
  (resumo financeiro é placeholder até os Módulos 4/8); Pedidos/Pagamentos
  são placeholder textual claro; Histórico já funciona de verdade (lista
  atendimentos encerrados da mesa, mesmo sem nenhum ainda existir).
- **Testes**: 8 unitários (transições de estado + `canOpenTable`); 3 de
  integração contra o Supabase real — abrir mesa com sucesso, rejeição
  pela aplicação, rejeição pelo índice único do banco pulando a aplicação
  de propósito (`tests/integration/open-table.test.ts`, `npm run
test:integration`); E2E cobrindo abrir mesa pela UI, aba Pessoas e
  confirmação de que a mesa fica ocupada (`tests/e2e/mesas.spec.ts`).
- **Saída**: garçom abre mesa pela UI, vê o card refletir o estado (reload
  manual — tempo real ainda não implementado, Módulo 5).

### Infra de teste nova neste módulo

- `npm run test:integration` — testes que batem no Postgres real (separado
  de `npm test`, que só roda os unitários, sem I/O);
- `vitest.setup.ts` carrega `.env` (Vitest não faz isso sozinho);
- `tests/mocks/server-only.ts` — o pacote `server-only` só existe para
  falhar dentro do bundler do Next; precisou de um shim para não quebrar
  os testes de integração, que importam módulos de aplicação marcados com
  ele.

### Fora de escopo de propósito (fica para módulos seguintes)

Fechar mesa, transferir mesa/item, juntar mesas, imprimir conferência —
todos dependem de `Order` (Módulo 4), `Payment` (Módulo 8) ou impressão
(Módulo 7), que ainda não existem.

## Módulo 4 — Pedidos ✅

- ✅ Fluxo de novo pedido em `/mesas/[id]/pedidos/novo` — carrinho
  client-side (produto → quantidade → pessoa → modificadores →
  observação → ponto da carne → revisão), grava tudo de uma vez ao
  "Enviar" (sem rascunho persistido — nada grava até o envio);
- ✅ `createOrder` transacional (`src/application/order/create-order.ts`):
  valida disponibilidade/preço/regras de grupo de modificador no servidor,
  congela preço/nome/setor em cada `OrderItem`, separa por setor
  (`sectorId` = `product.defaultSectorId` no momento do pedido), idempotente
  de verdade (chave repetida devolve o mesmo pedido, inclusive sob corrida
  concorrente), isolamento Serializable + retry para
  `sequenceNumber`/deadlock;
- ✅ Cancelamento de item em duas etapas
  (`src/application/order/cancel-order-item.ts`) — Garçom solicita, Admin
  autoriza (ou autoriza direto) — nunca apaga, sempre grava `AuditLog`,
  atualiza o status do pedido (rollup) e recalcula a comanda;
- ✅ `recalculateSessionTotals` — subtotal/total/saldo da comanda passam a
  ser reais (não mais "—" do Módulo 3), com aritmética em `Decimal` (nunca
  float, regra 20/21).
- **Testes**: 11 unitários (transições de estado); 9 de integração contra
  o Supabase real (`tests/integration/create-order.test.ts`,
  `cancel-order-item.test.ts`) cobrindo todos os itens pedidos pelo
  backlog: criar pedido, idempotência (inclusive sob corrida), rejeição de
  produto indisponível, congelamento de preço, auditoria, nunca apagar,
  fluxo de duas etapas, rollup do pedido; E2E completo
  (`tests/e2e/pedidos.spec.ts`): cadastro → abrir mesa → montar carrinho
  com adicional → enviar → conferir subtotal real na Comanda → cancelar →
  conferir subtotal voltando a zero.
- **Saída**: pedidos completos pela UI, com preço/setor congelados e
  saldo real da comanda. Sem tempo real e sem impressão ainda — produção/
  caixa precisam recarregar para ver (Módulos 5 e 7).

### Dois bugs reais encontrados e corrigidos pelos testes

1. `create-order.ts` não validava `minSelect`/`maxSelect`/`required` dos
   grupos de modificadores — só validava que o modificador pertencia ao
   produto. Corrigido antes mesmo de UI existir, ao notar a lacuna
   revisando o próprio código.
2. O formulário rápido de "novo adicional" (Módulo 2,
   `src/app/admin/produtos/[id]/modifiers-actions.ts`) não tinha campo
   "Ativo" — todo adicional criado por ali nascia com `active: false` e
   nunca aparecia para pedidos. Só foi pego pelo E2E deste módulo, porque
   foi o primeiro lugar que realmente filtra `active: true` ao listar
   modificadores. Corrigido: criação sempre nasce ativa.

### Observação de performance (não é bug, é acúmulo de dado de teste)

Os testes E2E não limpam os dados que criam (setores/categorias/produtos/
mesas com nomes com sufixo aleatório) — o banco de desenvolvimento já
acumulou dezenas de linhas assim, o que deixa as consultas de listagem do
admin visivelmente mais lentas e tornou os testes mais sensíveis a
timeout. Funciona, mas vale uma limpeza manual do banco de dev em algum
momento, ou adicionar rotina de limpeza aos specs de E2E.

## Repaginação visual (fora da numeração de módulos) ✅

Pedido explícito do usuário, após o Módulo 4: modernizar o layout de toda a
aplicação (navegação inferior no mobile com ícones, menu lateral no admin,
visual "de app grande"), sem alterar nenhuma regra de negócio. Baseado na
skill `frontend-design` (`.claude/skills/frontend-design/SKILL.md`, cópia do
arquivo fornecido pelo usuário) — token system de cor/tipografia/layout em
vez de componentes soltos.

- ✅ Tokens de marca em `tailwind.config.ts` (seção 11 do `CLAUDE.md`: "visual
  premium e sóbrio, vermelho escuro, dourado/bege"): `bg`/`ink`/`muted`/
  `line` (superfície clara de trabalho), `shell` (grafite escuro, só para
  navegação), `wine` (ação primária) e `gold` (destaque/valores). Fontes
  `Fraunces` (display) + `Manrope` (texto) via `next/font/google`;
- ✅ Componentes de apresentação compartilhados novos:
  `src/components/ui/card.tsx` (`Card`, `PageHeader`),
  `src/components/ui/badge.tsx` + `status-tone.ts` (mapeia
  `TableStatus`/`ServiceSessionStatus`/`OrderItemStatus` → cor do badge —
  fica na camada de UI, não no domínio), `src/components/ui/table.tsx`
  (`Table`/`Th`/`Td`/`Tr`);
- ✅ Navegação: barra inferior fixa no mobile (`src/app/(staff)/bottom-nav.tsx`
  — Mesas/Admin/Conta, ícones `lucide-react`) e menu lateral fixo no admin em
  telas médias+ (`src/app/admin/sidebar-nav.tsx`);
- ✅ Todas as telas existentes (login, Conta, Mesas, Mesa + 5 abas, Novo
  pedido, e as 4 seções de admin) restilizadas com os tokens novos, sem
  mudar nenhum texto/label testado pelos E2E (checklist de strings
  protegidas revisado por grep antes de cada alteração);
- ✅ Ajuste real de acessibilidade durante a repaginação: a página Conta
  mostrava o perfil duas vezes (nome + linha "Perfil"), causando
  ambiguidade de seletor; removida a linha redundante.
- **Testes**: nenhum teste novo (repaginação visual, não funcionalidade
  nova) — validado que a suíte E2E existente continua passando com o novo
  HTML/CSS (ver nota de flakiness abaixo), `npm run lint`, `tsc --noEmit` e
  `npm run build` limpos.
- **Saída**: mesma funcionalidade de ponta a ponta, visual novo em toda a
  aplicação, mobile e desktop.

### Suíte E2E após a repaginação — 6/9 e 9/9 (variando por execução)

Rodada com `--workers=1` (serializado, elimina disputa pelo compilador
único do Turbopack): 6/9 passam de forma limpa, incluindo os 3 testes de
login e os 3 primeiros de admin (criar setor/categoria/mesa). As 3 falhas
restantes são todas timeout num clique de navegação (link "Editar", link
de uma mesa na grade) — não falha de asserção de conteúdo. O
`error-context.md` de cada falha mostra a página de admin renderizando
uma tabela com **30+ linhas** de dado de teste acumulado (prefixos `E2E-`/
`PED-`, ver nota já registrada no Módulo 4 acima) — o mesmo problema de
acúmulo já havia sido identificado como responsável por deixar as
listagens do admin visivelmente mais lentas. Não foi encontrada nenhuma
falha ligada ao conteúdo/estilo novo (nenhum texto errado, nenhum
seletor quebrado) — é a mesma classe de flakiness ambiental já registrada
no Módulo 4, agravada pelo volume de dado acumulado desde então. Limpeza
do banco de dev segue como pendência (ver seção acima), agora com
evidência concreta de que também afeta os testes, não só a UX do admin.

### Logotipo oficial e paleta final da marca ✅

Pedido explícito do usuário, logo após a repaginação: usar o logotipo real
da MITIZ (não mais o selo "M" provisório) e travar a paleta nos 5 tons
oficiais informados (`#B58B57` dourado/bronze, `#AF2B1E` vermelho,
`#494949` cinza, `#F2ECE6` bege claro, `#1A1A1A` quase-preto).

- ✅ Pacote oficial de logo (`Logotipo Mitiz.zip`, fornecido pelo usuário)
  copiado para `public/brand/` (SVG fonte + versões horizontal/reduzida);
- ✅ `src/components/brand/mitiz-mark.tsx` e `mitiz-logo.tsx` — símbolo
  (chama + boi) e logotipo completo como componentes React inline
  (`fill="currentColor"`, sem cor própria), gerados a partir do SVG oficial
  para poderem ser tingidos por classe de cor (`text-gold`, `text-ink`
  etc.) em vez de ficarem presos a um PNG/JPG de cor fixa;
- ✅ Substituído o selo circular "M" pelo símbolo oficial: hero do login,
  cabeçalho da sidebar do admin, e nova barra de marca fina no topo do
  shell do garçom/caixa (`src/app/(staff)/layout.tsx`) — cobertura de logo
  em todas as áreas principais do app, não só numa tela;
- ✅ Favicon (`src/app/icon.svg`, convenção do App Router) usando o símbolo
  oficial;
- ✅ `tailwind.config.ts`: os 5 tokens de cor da marca (`bg`, `ink`, `muted`,
  `wine`, `gold`) passam a usar exatamente os hex fornecidos. Os tons
  `light`/`dark` de `wine`/`gold` e os tokens auxiliares `line`/
  `shell-line` (que não fazem parte da paleta oficial de 5 cores) são
  derivados por clareamento/escurecimento programático dos tons oficiais,
  documentado no próprio arquivo — não são cores inventadas soltas.
- **Testes**: `tsc --noEmit`, `npm run lint` e `npm run build` limpos;
  suíte E2E re-executada (6/9, mesma classe de flakiness ambiental já
  registrada acima — nenhuma falha nova ligada ao logo/paleta).
- **Saída**: logotipo oficial da MITIZ visível no login, no admin e no app
  do garçom/caixa; paleta de cores igual à marca em todo o sistema.

### Grid de mesas do garçom: faixa de status + alertas + valor ✅

Pedido do usuário: o card de mesa do app do garçom (`/mesas`) deveria
comunicar mais à distância — faixa colorida de status, alerta de pedido
pronto, valor da comanda em andamento e indicação de pagamento parcial.

- ✅ Faixa colorida no topo do card: verde para livre, vermelho/vinho para
  ocupada, dourado para status que pedem atenção — nova cor `free` (verde)
  adicionada ao `tailwind.config.ts` como exceção deliberada e documentada
  (não é cor de marca, é convenção funcional de status, reconhecida à
  distância; ver comentário no arquivo);
- ✅ Sininho + contador de itens `READY` aguardando entrega naquela mesa
  (seção 10 do CLAUDE.md, "alertas de pedidos prontos", que ainda faltava);
- ✅ Valor da comanda em andamento e "Pago R$ X de R$ Y" quando há
  pagamento parcial, usando os campos já calculados em `ServiceSession`
  (nunca inventando valor).
- **Testes**: `tsc --noEmit` e `npm run lint` limpos; cores conferidas por
  inspeção computada no navegador (bateram exatamente com os hex); suíte
  E2E de mesas rodada — falha isolada foi um timeout de clique na aba
  "Pessoas" da tela de mesa individual, arquivo não tocado nesta mudança,
  mesma classe de flakiness ambiental já documentada.

### Painel "Mesas" do administrador: visão gerencial completa ✅

Pedido do usuário, com referência visual de um app de mercado (dashboard
escuro com cards de mesa, indicadores no topo, gráfico de rosca e alertas):
uma visão bem mais completa que a do garçom, só para o Administrador — o
garçom continua com o grid enxuto do módulo anterior.

`/admin/mesas` deixou de ser só uma tabela de cadastro e virou um painel:

- ✅ 4 indicadores no topo — Total de mesas, Livres, Ocupadas, Fechando —
  com contagem e percentual. "Fechando" agrupa `WAITING_CLOSING` e
  `PARTIALLY_PAID` (estados já modelados no CLAUDE.md seção 7, mas que
  nenhum fluxo aciona ainda — ficam prontos para quando o Módulo 8/9,
  caixa e pagamentos, existir; hoje sempre aparecem zerados, o que é
  honesto, não um bug);
- ✅ Card de mesa mais denso que o do garçom: capacidade, consumo, **relógio
  ao vivo** (atualiza a cada segundo no navegador — não é tempo real
  multiusuário, isso é Módulo 5; é só não deixar o tempo "congelado" na
  tela do administrador), pessoas, garçom responsável e o mesmo alerta de
  pedido pronto do grid do garçom;
- ✅ Botão de ação por card varia com a regra de negócio de verdade: "Abrir
  mesa" só aparece quando `canOpenTable()` permite (mesa `FREE`); mesa
  ocupada mostra "Ver detalhes"; mesa `BLOCKED`/`RESERVED` mostra "Editar"
  em vez de oferecer abrir uma mesa que o backend recusaria;
- ✅ Painel lateral "Resumo do salão" — gráfico de rosca em SVG puro (sem
  biblioteca nova) com a proporção livre/ocupada/fechando/outras;
- ✅ Painel "Alertas" — mesa aberta há mais de 2h (limiar de tela, não regra
  de negócio) e mesa aguardando fechamento, quando existir;
- ✅ Formulário de criar mesa saiu do rodapé da página (não cabia mais no
  layout de painel) e virou `/admin/mesas/nova`, com redirect de volta
  para `/admin/mesas` após criar.
- **Decisões tomadas sem bloquear em pergunta** (reversíveis, registradas
  aqui): não adicionei filtro por "Área do salão" (não existe esse campo
  no schema — seria preciso migration) nem busca/toggle grade-lista (não
  foram pedidos explicitamente, só apareciam na imagem de referência);
  ambos são fáceis de somar depois se fizerem falta.
- **Testes**: `tsc --noEmit`, `npm run lint` e `npm run build` limpos;
  criação de mesa testada de ponta a ponta no navegador (formulário →
  redirect → aparece no painel com contagem atualizada) e depois removida;
  status `BLOCKED` testado manualmente para confirmar que o card mostra
  "Editar" em vez de "Abrir mesa".
- **Saída**: `/admin/mesas` é agora um painel gerencial (indicadores,
  gráfico, alertas, cards ao vivo); `/admin/mesas/nova` concentra o
  cadastro; `/mesas` (garçom) continua enxuto, sem essas informações extras.

**Bug real encontrado pelo usuário e corrigido**: o botão "Editar" só
aparecia no card de mesa `BLOCKED`/`RESERVED` — mesa `FREE` ou `OCCUPIED`
(ou seja, praticamente toda mesa no dia a dia) não tinha nenhum jeito de
editar nome/capacidade a partir do painel. Corrigido com um ícone de lápis
sempre visível no cabeçalho do card, independente do status. Aproveitado
para restaurar, na própria tela de edição, o aviso que existia na versão
antiga (tabela simples) e se perdeu na reforma: mesa nunca é apagada
(histórico de atendimento preservado — CLAUDE.md regra 25), usar o status
Bloqueada para tirar de operação. Testado no navegador: editar nome de
verdade (ida e volta) e confirmar que persiste.

## Módulo 5 — Tempo real ✅

Decisão de arquitetura registrada em
[ADR 0003](architecture/decisions/0003-tempo-real-broadcast.md): Supabase
Realtime via **Broadcast público**, publicado pelo servidor (service role,
API REST — sem WebSocket ficando aberto numa server action) depois que a
transação de negócio já commitou, nunca via `postgres_changes` (exigiria
abrir política de RLS nas tabelas, duplicando a regra de permissão que já
existe no backend — CLAUDE.md regra 25).

- ✅ `src/lib/realtime/channels.ts` — nomes de canal (`table:{id}`,
  `restaurant:{id}:tables`, `sector:{id}` — este último pronto para o
  Módulo 6, ainda sem assinante) e o nome do evento, puro/testável;
- ✅ `src/lib/realtime/publish.ts` — publica via
  `POST {SUPABASE_URL}/realtime/v1/api/broadcast`; payload só com um
  `type` textual, nunca dado de negócio; nunca lança (falha de rede aqui
  não pode derrubar uma mutação que já foi persistida — só loga);
- ✅ `src/components/realtime/realtime-refresh.tsx` — client component que
  assina os canais recebidos e chama `router.refresh()` ao receber
  qualquer evento **ou** ao (re)conectar — cobre "reconexão dispara
  refetch" sozinho, via o próprio reconnect automático do cliente Supabase;
- ✅ Publicação plugada nas mutações que já existem, sempre depois da
  transação commitar: abrir mesa (`open-table.ts`), criar pedido
  (`create-order.ts` — só quando o pedido é criado de fato, não numa
  repetição idempotente) e solicitar/autorizar cancelamento de item
  (`cancel-order-item.ts`);
- ✅ Assinatura plugada nas 3 telas que mostram estado ao vivo: grid do
  garçom (`/mesas`), painel do admin (`/admin/mesas`) — ambos no canal do
  restaurante — e a mesa individual (`/mesas/[id]/*`, todas as abas via o
  layout compartilhado) no canal da própria mesa.
- **Testes**: `tests/unit/realtime-channels.test.ts` (nomes de canal) e
  `tests/unit/realtime-publish.test.ts` (publica no endpoint certo, não
  publica sem canais/sem variável de ambiente, nunca lança em falha de
  rede) — mock de `fetch`, sem rede real. O round-trip completo (mutação
  real → broadcast → tela atualiza sozinha) foi verificado manualmente
  contra o Supabase real: com a tela `/admin/mesas` aberta e parada, uma
  mesa foi aberta por fora (mesma transação que `openTable` faz) e a tela
  atualizou os indicadores e o card sem nenhum reload manual. Não foi
  criado teste automatizado desse round-trip (exigiria jsdom/Testing
  Library, dependência nova só para isso — não instalada, decisão
  registrada na ADR 0003) nem suíte E2E nova (o Playwright já cobre os
  fluxos de abrir mesa/criar pedido/cancelar item; tempo real é reforço de
  tela sobre eles, não um fluxo novo a testar de ponta a ponta);
  `tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (38/38) e
  `npm run test:integration` (12/12) limpos.
- **Saída**: garçom, caixa e admin veem mesa/pedido mudar de estado sem
  recarregar a página, em qualquer tela que já mostra dado ao vivo hoje.
- **Ponto de atenção para módulos futuros**: `publishChange` não é
  automático — toda mutação nova que deveria refletir na tela em tempo
  real (Módulo 8, pagamentos; Módulo 9, autorização de cancelamento pelo
  admin) precisa lembrar de chamar `publishChange` depois de commitar, como
  parte do "pronto" dessa mutação.

## Módulo 6 — Produção ✅

Hipótese de design registrada aqui (item de pedido não tem status
"recebido" próprio — só `SENT → IN_PREPARATION → READY → DELIVERED`,
CLAUDE.md seção 7): "marcar pedido como recebido" (seção 5) é tratado como
efeito colateral de iniciar o preparo do primeiro item, não uma ação à
parte — ver `deriveOrderProgressStatus` em `src/domain/order/states.ts`.

- ✅ `deriveOrderProgressStatus` (domínio, puro) — deriva o status do
  *pedido* a partir do conjunto de status dos seus itens não cancelados:
  só avança de estágio quando **todos** os itens ativos já alcançaram
  aquele estágio (reflete que um pedido só está "pronto" quando cada
  setor envolvido terminou a sua parte), nunca regride;
- ✅ `src/application/production/update-item-status.ts` — avança um item
  na esteira (valida a transição com `canTransitionOrderItem`, já existente
  desde o Módulo 4), recalcula o rollup do pedido e publica em tempo real
  (canal da mesa, do restaurante e **do setor** — novo canal assinado
  nesta tela); sem checagem de permissão aqui, mesmo padrão de
  openTable/createOrder/cancelOrderItem (permissão é responsabilidade da
  server action);
- ✅ `create-order.ts` também passou a publicar no(s) canal(is) de setor
  dos itens do pedido novo — a coluna "Novos" da produção atualiza sozinha
  quando um pedido é enviado, sem precisar do refresh manual;
- ✅ Tela `/producao` (redireciona para o primeiro setor ativo) e
  `/producao/[sectorId]` — quadro com as 4 colunas da seção 10
  (Novos/Em preparo/Prontos/Entregues), seletor de setor por abas, cada
  card com mesa, item, ponto da carne, adicionais e observação em
  destaque; botão de avançar por coluna (não aparece em "Entregues" —
  status terminal); "Entregues" tem teto de 20 itens mais recentes (é
  histórico recente, não fila — sem isso cresceria sem fim no turno);
- ✅ Aba "Produção" na navegação do garçom/admin, visível só para quem tem
  `PRODUCTION_STATUS_UPDATE` (Administrador e Produção, por definição do
  papel — CLAUDE.md seção 5);
- **Testes**: unitários para `deriveOrderProgressStatus` (nunca regride;
  só avança IN_PREPARATION/READY/DELIVERED quando *todos* os itens ativos
  chegaram lá; ignora item cancelado); integração para
  `updateOrderItemStatus` (esteira completa, rejeita pular etapa, rejeita
  avançar item já entregue, rollup do pedido observado com pedido de 2
  itens, item de um setor não aparece numa consulta filtrada por outro
  setor). Verificado manualmente no navegador: clique real em "Iniciar
  preparo" moveu o item de coluna e o pedido foi para `IN_PREPARATION` no
  banco; e — mudando um item por fora (sem clicar na aba aberta) — a
  coluna atualizou sozinha via o novo canal de tempo real por setor.
  `tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (46/46) e
  `npm run test:integration` (18/18) limpos.
- **Saída**: cozinha/parrilla/bar operam a fila pelo sistema, com
  atualização em tempo real refletindo no salão/caixa (Módulo 5) e na
  própria tela de produção.

## Módulo 7 — Impressão ✅

Hardware confirmado com o usuário antes de implementar (CLAUDE.md exige
isso): impressora térmica **Epson** (ESC/POS padrão), **USB**, num
computador Windows do restaurante. Arquitetura completa em
[printing/architecture.md](printing/architecture.md), escrita antes do
código — decisão principal: agente local separado do app (Vercel é
serverless, não fala com USB), autenticado por token próprio por
impressora (nunca a service role key), consumindo a fila por polling HTTP
(nunca WebSocket — o agente só precisa falar pra fora).

- ✅ `Printer.agentTokenHash` (migration manual — shadow DB do `prisma
  migrate dev` não funciona contra o pooler do Supabase, fluxo documentado
  em `docs/database/schema.md` §7) — só o hash SHA-256 do token fica
  gravado, o texto puro aparece uma vez só, na hora de gerar;
- ✅ `src/domain/printing/ticket.ts` — formato do ticket via zod (schema +
  tipo), validado tanto na criação quanto toda vez que é lido de volta do
  banco (`PrintJob.contentSnapshot` é `Json`, não tipado — fronteira que
  precisa de validação em tempo de execução);
- ✅ `PrintJob` criado dentro da mesma transação de quem originou:
  - Pedido enviado (`create-order.ts`) — um job por setor presente no
    pedido (por isso "Setor" é campo único no ticket, não lista); primeiro
    pedido do atendimento usa tipo `NEW_ORDER`, os seguintes na mesma mesa
    usam `COMPLEMENT`;
  - Item cancelado de fato (`cancel-order-item.ts`, só em
    `authorizeCancelOrderItem`) — tipo `CANCELLATION`, avisa a produção
    pra parar/não entregar;
- ✅ `/api/print-jobs/pending` (GET) e `/api/print-jobs/[id]` (PATCH) —
  rotas que o agente consome; **fora** do middleware de sessão do
  navegador (rota de API não deveria responder a chamador sem cookie com
  redirect HTML pro /login — isso quebraria qualquer cliente que não seja
  browser); autenticação própria por token Bearer;
- ✅ `/admin/impressoras` — cadastro da impressora + gerar/mostrar o token
  uma vez (ADMIN_MANAGE, mora em `/admin` mesmo);
- ✅ `/impressao` — fila/histórico (últimos 50), reprocessar `FAILED`,
  reimprimir qualquer job — **fora** de `/admin` de propósito: Caixa e
  Produção também reimprimem (CLAUDE.md seção 5), e `/admin` inteiro é
  gated só pra Administrador; nova permissão `PRINT_JOBS_MANAGE` (Admin,
  Caixa, Produção) e aba "Impressão" na navegação pra quem a tem;
- ✅ [`printer-agent/`](../printer-agent/) — script Node standalone (fora
  do app Next.js/Vercel de propósito), usando `node-thermal-printer`
  (Epson via spooler do Windows), com README passo a passo de instalação;
- **Testes**: unitários (`ticket.ts`, `states.ts` do PrintJob, geração/hash
  de token) e integração completa (`tests/integration/print-jobs.test.ts`
  — job criado por setor, `NEW_ORDER` vs `COMPLEMENT`, `CANCELLATION` com
  motivo, autenticação por token aceita/rejeita, claim marca
  `PROCESSING`, falha fica disponível pra reprocessar sem duplicar,
  sucesso grava `printedAt`, reimpressão cria job novo preservando o
  original). Verificado manualmente de ponta a ponta contra a API real:
  gerei um token pela tela, enviei um pedido de verdade, consultei
  `/api/print-jobs/pending` com o token (recebi o ticket completo já
  validado), confirmei `PRINTED` via PATCH, testei reimprimir (criou job
  novo, original intacto) e testei token errado (401). O que eu **não**
  pude testar: impressão real em papel — não tenho acesso à rede local
  nem à impressora física do usuário (registrado em
  `printing/architecture.md` §"O que eu não pude validar"). `tsc
  --noEmit`, `npm run lint`, `npm run build`, `npm test` (60/60) e `npm
  run test:integration` (26/26) limpos.
- **Ajuste de infra que essa mudança forçou**: `PrintJob` agora nasce
  junto com `Order` em vários fluxos, então os testes de integração de
  Módulos 4/6 que apagavam `Order` direto no `afterAll` passaram a violar
  `onDelete: Restrict` — corrigido apagando `PrintJob` antes. `testTimeout`
  global do Vitest subiu de 5s (padrão) pra 15s: transações maiores (agora
  gravam `PrintJob` também) estavam estourando o teto em ambiente com a
  latência de rede já documentada no projeto — não afeta os testes
  unitários (sem I/O, sempre terminam bem antes).
- **Saída**: pedido enviado, complementado ou cancelado gera ticket
  automaticamente, separado por setor; falha de impressão nunca se perde
  (fica na fila pra reprocessar); reimpressão manual sempre disponível pra
  quem tem permissão.

### Impressão validada em impressora real (2026-08-05) ✅

Depois do deploy, o usuário cadastrou a impressora (Epson TM-T20, USB,
compartilhada no Windows) e gerou o token pela tela. Dois problemas reais
apareceram testando contra o hardware de verdade — ambos documentados em
[printing/architecture.md](printing/architecture.md) e corrigidos:

1. Build do Vercel falhou (`prisma generate` não rodou por causa do cache
   de build restaurado) — corrigido com `postinstall` explícito no
   `package.json` raiz;
2. A primeira versão do agente dependia do pacote `printer` (driver nativo
   via node-gyp) pra falar com a impressora — não instalou (pacote antigo,
   mal mantido, conflito de dependência interna dele mesmo). Trocado pelo
   mecanismo `copy /b` do Windows (a `node-thermal-printer` só monta os
   bytes ESC/POS num arquivo temporário; quem entrega pra impressora é o
   `copy /b`, comando nativo, sem dependência nenhuma).

Depois disso: **ticket saiu impresso de verdade, com acentuação correta**
(precisou fixar `characterSet: PC860_PORTUGUESE` — sem isso, a lib engolia
o erro de encoding internamente e reportava sucesso mesmo com texto
faltando, sintoma enganoso). Fonte aumentada a pedido do usuário
(`setTextDoubleHeight()`, só altura pra não bagunçar a largura de coluna).

Aprendizado de processo registrado aqui: a automação de navegador usada
pra criar pedidos de teste ficou instável no meio da sessão de debug
(clique não disparava o `useActionState`/form submit de forma confiável) —
um "não imprimiu" foi erroneamente atribuído à fonte maior, quando na
verdade o pedido de teste nunca tinha sido criado. Resolvido criando o
pedido de teste direto no banco (mesmo shape que `createOrder` grava) pra
isolar o teste do agente da instabilidade da automação do navegador.

### "Imprimir conferência" — resumo da comanda (2026-08-11) ✅

Pedido explícito do usuário: um ticket com o mesmo cabeçalho dos tickets de
pedido, resumo consolidado de itens/valores, total, divisão igual por
pessoa e, se já houver, pagamentos registrados e saldo atual. Era a última
peça pendente da lista de ações da tela da mesa em CLAUDE.md seção 10
("Imprimir conferência"), registrada como fora de escopo desde o Módulo 3
(linha ~147 acima) até os módulos que ela depende (`Order`, `Payment`,
impressão) existirem.

- ✅ Novo `PrintJobType.BILL_SUMMARY` — diferente dos outros 4 tipos, não é
  sobre um `Order` nem um setor de produção: é sobre o `ServiceSession`
  inteiro. `orderId`/`sectorId` do `PrintJob` viraram opcionais,
  `serviceSessionId` novo (migration
  `20260811190000_bill_summary_print_job`, só adição de valor de enum +
  colunas opcionais, sem reescrita de dado — bem mais simples que a
  migration do Módulo 8);
- ✅ `src/domain/printing/bill-summary.ts` — schema próprio (zod), valores
  monetários já formatados em BRL no `contentSnapshot` (o agente não tem
  Decimal/Intl, mesmo racional de `meatPointLabel` em `ticket.ts`);
- ✅ `src/application/printing/create-bill-summary-print-job.ts` — reusa
  `buildConsolidatedSummary` (mesmo totalizador já usado na tela da mesa) e
  `splitEqually` (mesma divisão igual já usada em "Dividir a conta");
- ✅ `createReprintJob` rejeita reimprimir esse tipo (o saldo pode ter
  mudado desde a impressão original; gerar um resumo novo pela tela da
  mesa é o caminho certo, não reaproveitar o snapshot antigo) — decisão
  registrada, não um limite técnico;
- ✅ Botão "Imprimir" ao lado do título "Resumo da comanda" na tela da mesa
  (`src/app/(staff)/mesas/[id]/page.tsx`) — ação junto do que está sendo
  impresso, não escondida no cabeçalho; toast avisa se não há impressora
  cadastrada ainda (job fica registrado mesmo assim, mesmo comportamento
  dos outros tipos sem impressora);
- **Testes**: 4 unitários (`bill-summary.ts`) + 4 de integração novos em
  `tests/integration/print-jobs.test.ts` (resumo com itens/total/divisão
  por pessoa, pagamentos + saldo, rejeição de reimpressão, claim sem erro
  de validação). `tsc --noEmit`, `npm run lint`, `npm run build` e `npm
  test` (108/108) limpos; `npm run test:integration` limpo (as duas falhas
  vistas numa primeira rodada foram conflito de transação Serializable sob
  concorrência entre arquivos de teste — pré-existente, confirmado
  rodando os mesmos arquivos isolados sem falha, não relacionado a esta
  mudança).

## Módulo 8 — Caixa e pagamentos

- `Payment`, `PaymentMethod`, `Discount`, `ServiceCharge`;
- Tela de caixa: mesas aguardando fechamento, conferência, divisão, taxa,
  desconto, pagamentos, saldo, finalização;
- Divisão por pessoa, item, valor, igualmente (com regra determinística de
  arredondamento);
- Múltiplas formas de pagamento por fechamento;
- Bloqueio de fechamento com saldo diferente de zero;
- Operações financeiras transacionais.
- **Testes**: calcular taxa de serviço; aplicar desconto com auditoria;
  registrar pagamento parcial; usar múltiplas formas de pagamento; impedir
  fechamento com saldo; fechar e liberar mesa; valores exatos em todos os
  casos acima.
- **Saída**: fluxo de fechamento completo, ponta a ponta.

## Módulo 9 — Cancelamentos e auditoria (consolidação) ✅

- ✅ `AuditLog` já era transversal desde os módulos anteriores (cancelamento
  de item, desconto aplicado/anulado, taxa aplicada/retirada, fechamento
  solicitado/cancelado/finalizado, pagamento registrado/estornado, pessoa
  quitada/reaberta — 14 ações via `writeAuditLog`, sempre dentro da mesma
  transação da operação);
- ✅ Tela de auditoria (2026-08-11, `/historico/auditoria`) com os 4 filtros
  pedidos: usuário, mesa, tipo de ação, data. **Fora** de `/admin` de
  propósito — `/admin` inteiro é gated só pra `ADMIN_MANAGE`, mas Caixa
  também tem `AUDIT_VIEW` (business-rules.md §7: "ver auditoria/
  relatórios" — Admin sim, Caixa parcial), então fica junto de
  `/historico` (mesmo público, abas "Atendimentos"/"Auditoria" em vez de
  um sétimo ícone na barra inferior);
- ✅ `AuditLog.tableId` novo (migration só de adição), desnormalizado de
  propósito: a entidade auditada (`OrderItem`, `Discount`, `ServiceCharge`,
  `ServiceSession`, `Payment`, `Guest`) chega na mesa por relação diferente
  conforme o tipo — resolver isso em tempo de consulta exigiria uma junção
  diferente por `entityType`. Todos os 8 pontos que chamam `writeAuditLog`
  atualizados para passar o `tableId` (parâmetro obrigatório de propósito,
  não opcional — typecheck garante que nenhum foi esquecido);
- ✅ `src/domain/audit/labels.ts` (catálogo de rótulo em português por
  ação) e `src/domain/audit/metadata.ts` (formata o `metadata` variável de
  cada ação pra exibição genérica, sem dicionário por campo).
- **Testes**: 6 unitários novos (`audit-labels.test.ts`) + asserção de
  `tableId` adicionada ao teste de integração de cancelamento já existente
  (`cancel-order-item.test.ts`). `tsc --noEmit`, `npm run lint`, `npm run
  build` e `npm test` (119/119) limpos; `npm run test:integration` dos
  arquivos afetados (23/23) limpo.

## Módulo 10 — Histórico ✅

- ✅ Aba "Histórico" na tela da mesa (atendimentos anteriores);
- ✅ Detalhe completo de um atendimento encerrado (2026-08-11, pedido do
  usuário) — `/mesas/[id]/historico/[sessionId]`: resumo financeiro
  (subtotal, taxa, desconto, total, pago, saldo), taxa/desconto aplicados
  e por quem, pessoas da mesa, itens consumidos consolidados (quantidade e
  valor, reusa `buildConsolidatedSummary`) e pagamentos registrados
  (forma, valor, pessoa vinculada quando houver, quem registrou, quando).
  Tela estática de propósito (sem `RealtimeRefresh`): atendimento encerrado
  não muda mais;
- ✅ Consulta de atendimentos encerrados **de todas as mesas** com filtro
  por data/garçom (2026-08-12, pedido do usuário) — `/historico`, visão
  geral independente de mesa, data padrão hoje;
- ✅ `/impressao` ganhou filtro de data (padrão hoje, sempre) e mesa,
  mesmo pedido.

## Módulo 11 — Relatórios básicos ✅

- ✅ 4 relatórios pedidos pelo usuário (2026-08-13), todos dentro de
  `/admin/relatorios` (`ADMIN_MANAGE`), com filtro De/Até compartilhado
  (padrão: últimos 7 dias) e abas entre eles:
  - **Vendas por período** (`/admin/relatorios`) — faturamento por dia,
    ticket médio, atendimentos fechados;
  - **Vendas por produto** (`/produtos`) — ranking de faturamento por
    produto, top 20;
  - **Tempo de mesas abertas** (`/mesas`) — duração de cada atendimento
    fechado (abertura até fechamento), do mais demorado pro mais rápido,
    com média;
  - **Horários de pico** (`/horarios-pico`) — atendimentos abertos e
    faturamento por hora do dia, pra saber quando chega mais gente e em
    que horário sai mais venda.
  Todos os 4 usam só atendimentos `CLOSED` (mesa cancelada nunca foi
  venda). Os 3 primeiros filtram/agrupam por `closedAt` (quando a venda se
  conclui); "horários de pico" é a exceção deliberada e usa `openedAt`
  (é sobre chegada, não sobre conclusão da venda) — decisão documentada
  no próprio `src/domain/reports/peak-hours.ts`;
- ✅ Sem biblioteca de gráfico nova: barras horizontais simples
  (`src/components/ui/bar-row.tsx`), mesmo racional do `DonutChart`
  existente, só com os tokens de cor da marca (dourado pra dinheiro,
  vinho pra contagem de pessoas);
- Fora de escopo por pedido explícito do usuário (não selecionados): vendas
  por setor, vendas por forma de pagamento. Não implementar sem novo
  pedido.
- **Testes**: 10 unitários novos (`reports.test.ts`, as 4 funções de
  agregação) + 3 novos em `datetime.test.ts` (helpers de intervalo).
  `tsc --noEmit`, `npm run lint`, `npm run build` e `npm test` (134/134)
  limpos. Sem migration (nenhuma mudança de schema).

## Módulo 12 — Integração futura com PDV (preparação)

- Interfaces/serviços de sincronização de produto, preço, venda finalizada,
  identificador externo e status de integração, **sem** implementar contra
  um fornecedor real até a API oficial ser analisada (seção 21 do
  `CLAUDE.md`).

## Módulo 13 — Administração de usuários ✅

Não estava no roteiro original nem no backlog (CLAUDE.md §4/§23) — pedido
novo do usuário (2026-08-13): tela de admin pra cadastrar usuário, dar/tirar
permissão e ter controle de quem usa o sistema.

- ✅ `/admin/usuarios` (lista, `ADMIN_MANAGE`), `+ Novo usuário` e link
  "Editar" por linha, com badge Ativo/Inativo (`StatusBadge`);
- ✅ Decisão confirmada com o usuário (`AskUserQuestion`): permissão por
  **perfil fixo** (Administrador/Caixa/Garçom/Produção, já existentes desde
  o Módulo 1 — CLAUDE.md §5), não permissão avulsa por pessoa. Não muda
  nada do modelo `Role`/`Permission`/`RolePermission` que já existia, só
  constrói a tela por cima;
- ✅ `/admin/usuarios/novo` já cria o login de verdade (Supabase Auth, via
  `createServiceRoleClient()` já existente) junto com o cadastro interno
  (`User`) — decisão confirmada com o usuário. Nome, e-mail, senha
  temporária (mín. 8 caracteres, o admin repassa pra pessoa), perfil e
  ativo/inativo. Se o registro interno falhar depois do login criado,
  desfaz o login (`auth.admin.deleteUser`) pra não sobrar conta órfã sem
  cadastro correspondente;
- ✅ `/admin/usuarios/[id]/editar`: nome, perfil e ativo/inativo. E-mail
  não é editável aqui (é a identidade da conta no Supabase Auth, mudar
  isso mexe nos dois sistemas juntos, fora do pedido); troca de senha
  também não entrou nesta primeira versão (não pedido, e não existe hoje
  tela de "trocar minha senha" pro próprio usuário — ficaria um recurso
  pela metade);
- ✅ `src/domain/auth/user-guard.ts` (`wouldLeaveNoActiveAdmin`, pura):
  bloqueia qualquer mudança (desativar ou trocar de perfil) que deixasse o
  restaurante sem nenhum administrador ativo — cobre tanto "removi meu
  próprio acesso sem querer" quanto "desativei o último admin que sobrava";
- ✅ Auditoria (CLAUDE.md regra 22): `user.created` e `user.updated`
  (nome/perfil/ativo antes e depois) em `AuditLog`, aparecem em
  `/historico/auditoria` como qualquer outra ação;
- **Fora de escopo** (não pedido, não implementado): permissão avulsa por
  pessoa além do perfil; edição de e-mail; redefinição/troca de senha;
  autocadastro.
- **Testes**: 5 unitários novos (`user-guard.test.ts`, a regra do último
  admin). Sem teste de integração automatizado pra criação de usuário — a
  parte que chama `auth.admin.createUser` de verdade cria uma conta real no
  Supabase Auth compartilhado (mesmo banco de dev e produção, ADR 0002),
  então a verificação foi manual em produção (login com o usuário criado)
  em vez de automatizada, pra não deixar contas de teste acumulando no
  `auth.users` real. `tsc --noEmit`, `npm run lint`, `npm run build` e
  `npm test` (140/140) limpos. Sem migration (`User`/`Role`/`Permission` já
  existiam desde o Módulo 1).

## Módulo 14 — Retiradas ✅

- Pedido do usuário: pedido avulso para retirada (balcão, WhatsApp,
  telefone), sem ocupar mesa física, reaproveitando ao máximo o que já
  existia — decisão de arquitetura completa em ADR 0005
  (`docs/architecture/decisions/0005-modulo-retiradas.md`);
- ✅ `ServiceSession.type` (`TABLE`/`PICKUP`), `restaurantId`
  denormalizado, `tableId` opcional, campos de retirada (`customerName`,
  `customerPhone`, `pickupOrigin`, `requestedAt`, `pickupNote`,
  `pickupNumber` sequencial por restaurante que nunca reinicia — decisão
  do usuário) — migration `20260814120000_pickup_sessions`;
- ✅ `createPickup` (análogo a `openTable`); `createOrder`,
  `cancelOrderItem`, `registerPayment`, `applyDiscount`,
  `applyServiceCharge`, `requestClosing`, `cancelClosingRequest`,
  `closeTable`, `updateOrderItemStatus` adaptados para funcionar com ou
  sem mesa, sem duplicar nenhuma dessas funções;
- ✅ Ticket impresso ganha cabeçalho de retirada ("RETIRADA #047 /
  Cliente / Telefone / Horário") no lugar de "Mesa: X" — mesmo
  `PrintJobType`, sem novo fluxo de status (nenhum "em preparo"/"pronto"
  para retirada, fora de escopo por pedido explícito do usuário);
- ✅ Telas do garçom: abas "Mesas"/"Retiradas" (`AtendimentoTabs`, mesmo
  padrão de Histórico/Auditoria — não um ícone novo na barra inferior),
  `/retiradas` (lista + "Nova retirada"), `/retiradas/[id]` (mesma
  anatomia da tela da mesa, sem aba Pessoas), `/retiradas/[id]/pedidos/
  novo` (mesmo carrinho `NewOrderForm` das mesas) e `/retiradas/[id]/
  pagamentos` (mesmos 7 formulários/botões financeiros das mesas, sem
  divisão por pessoa);
- ✅ Painel do administrador: `/admin/retiradas` (cards, alertas de
  retirada aberta há muito tempo) + item na sidebar + card "Retiradas em
  andamento" em `/admin/mesas`, sem misturar contagem com mesas físicas;
- ✅ `/historico` (geral) e `/impressao` passam a incluir retiradas
  (rótulo "Retirada #N", link para `/retiradas/[id]`) — os dois
  filtravam por `table.restaurantId`, o que excluiria retirada
  silenciosamente; corrigido junto;
- ✅ Permissão: reaproveita `TABLES_OPEN` para abrir retirada — hipótese
  reversível confirmada com o usuário, sem código de permissão novo;
- Fora de escopo por pedido explícito do usuário: status de preparo/
  pronto/entregue específico de retirada, painel de cozinha dedicado
  (itens de retirada aparecem no `/producao` normal), delivery,
  rastreamento, integração com WhatsApp, notificações ao cliente.
- **Testes**: 5 integração novos (`tests/integration/pickup.test.ts` —
  numeração sequencial, pedido/impressão/cancelamento com cabeçalho de
  retirada, pagamento e fechamento sem mesa). `vitest.integration.config.ts`
  ganhou `fileParallelism: false` (todos os arquivos de integração
  compartilham o mesmo `Restaurant` real — rodar em paralelo já causava
  conflito de transação `Serializable` intermitente antes deste módulo;
  ficou mais visível ao acrescentar um arquivo de teste a mais). `tsc
  --noEmit`, `npm run lint`, `npm run build`, `npm test` (142/142) e `npm
  run test:integration` (56/56) limpos.

---

## Módulo 15 — Pagamento por itens e rateio de consumo ✅

- Pedido do usuário: montar exatamente o que uma pessoa está pagando
  (unidades de item com quantidade, fração de item compartilhado, valor
  personalizado, ou combinação) antes de escolher a forma de pagamento,
  sabendo depois o que já foi quitado e o que continua em aberto —
  decisão de arquitetura completa em ADR 0006
  (`docs/architecture/decisions/0006-pagamento-por-itens.md`);
- ✅ `PaymentItemAllocation` (liga um `Payment` a uma fatia de um
  `OrderItem`, `AllocationKind` `UNITS`/`AMOUNT`) e
  `OrderItem.openShareParts` (em quantas partes o saldo aberto de um item
  dividido está agora) — migration `20260815120000_payment_item_allocations`.
  Camada aditiva: `recalculateSessionTotals` e nenhuma tabela financeira
  existente foram alteradas;
- ✅ `src/domain/payment/item-allocation.ts` — cálculo puro de aberto/
  pago por item, agrupamento para a tela de seleção (unidades entre
  pedidos diferentes via FIFO) e distribuição determinística
  (`distributeUnitsFifo`);
- ✅ `registerPayment` estendido para aceitar uma lista de alocações,
  sempre revalidada contra o banco dentro da transação (nunca confia no
  que o cliente calculou); `setOrderItemShareParts` ("Dividir"/
  "Redistribuir") disponível pra qualquer item (revisão 2026-08-16, ver
  próximo item);
- ✅ Tela de seleção de consumo (`/mesas/[id]/pagamentos/novo` e
  equivalente de retirada, mesmo componente reaproveitado) — carrinho
  local até confirmar, sem gravar nada antes disso; "Pagamento sem
  detalhar itens" (fluxo anterior) continua disponível como opção
  secundária;
- ✅ Bloco "Itens" na tela de pagamentos (lançado/pago/aberto por linha,
  sempre visível) e resumo dos itens cobertos no diálogo de estorno;
- ✅ Correção 2026-08-15 (relato do usuário): stepper de unidades começava
  com "1" pré-marcado mesmo sem nada no carrinho — agora começa zerado.
- ✅ Correção 2026-08-15 (relato do usuário): item lançado quantity=1 em
  pedidos diferentes (ex.: 1 chope agora, mais 1 chope num pedido
  separado depois) não agrupava na seleção de pagamento. Regra de
  agrupamento revisada em ADR 0006 — junta por produto+ponto+adicionais+
  pessoa independente da quantidade de cada linha.
- ✅ Correção 2026-08-15: painel de situação ("Itens" na tela de
  pagamentos) tinha o mesmo problema de agrupamento, corrigido junto
  (critério unificado numa função só, usada pelas duas telas).
- ✅ Revisão 2026-08-16 (pedido do usuário): "Dividir"/"Redistribuir"
  deixou de exigir item de quantidade 1 isolado — agora está disponível
  em qualquer linha da seleção (chope com várias unidades, ou duas
  porções iguais lançadas em pedidos diferentes), dividindo o saldo
  SOMADO do grupo inteiro em N partes (sugestão inicial de N = quantidade
  de pessoas do atendimento). Seleção por unidades (stepper) e "Dividir"
  convivem na mesma linha — o operador escolhe qual usar. Uma fração pode
  atravessar mais de uma linha de origem real (`distributeAmountFifo`,
  novo, mesmo racional de `distributeUnitsFifo` só que por valor em R$).
- Fora de escopo por decisão do usuário 2026-08-15: taxa de serviço e
  desconto não entram no rateio por item (a MITIZ não cobra taxa hoje e
  desconto é sobre o total).
- ✅ Correção 2026-08-18 (relato do usuário em produção): valor nominal da
  parte era recalculado a cada pagamento como saldo aberto atual dividido
  pelas partes, encolhendo a cada parte paga (76 dividido em 4 partes de
  19; depois de pagar uma, o saldo de 57 virava 4 partes de 14,25). Novo
  campo `OrderItem.openShareBaseAmount` (migration
  `20260818120000_order_item_share_base_amount`) grava a base FIXA no
  momento de "Dividir"/"Redistribuir"; o nominal da parte usa sempre essa
  base, nunca o saldo atual — só muda com uma redistribuição explícita.
- ✅ Correção 2026-08-19 (relato do usuário em produção): unidade e
  "Dividir" NÃO convivem mais na mesma linha quando ela está dividida —
  pagar 1 unidade de um item já com partes pagas cobrava o preço cheio da
  unidade de novo, sem descontar o que já tinha sido quitado pelas
  partes (as duas formas leem "o que já foi pago" de jeitos diferentes).
  Enquanto o grupo estiver dividido, "Selecionar unidades" some da tela
  (vira uma nota explicando o motivo) e o servidor rejeita qualquer
  alocação `UNITS` contra linha com `openShareParts` gravado, mesmo
  pulando a tela.
- **Testes**: 14 integração
  (`tests/integration/payment-item-allocation.test.ts` — unidades
  parciais com rejeição de sobre-alocação, agrupamento entre pedidos
  diferentes, item dividido com redistribuição sem afetar pagamento
  anterior, combinação dos três tipos numa mesma cobrança, valor
  personalizado limitado ao saldo aberto, estorno com devolução correta,
  pagamento livre continua funcionando, dividir item com mais de 1
  unidade, dividir duas linhas de origem atravessando ambas numa fração
  só, valor da parte fixo entre 4 pagamentos sem redistribuir, rejeição
  de unidade contra item dividido, rejeições) e 22 unitários
  (`tests/unit/item-allocation.test.ts`, incluindo `distributeAmountFifo`
  e o caso de valor fixo com saldo encolhendo). `tsc --noEmit`,
  `npm run lint`, `npm run build`, `npm test` (164/164) e
  `npm run test:integration` (69/69) limpos.

## Ordem de execução recomendada

0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12

Todas as decisões técnicas necessárias para os módulos 5 e 7 já foram
confirmadas (ver ADR 0001). O único ponto ainda em aberto — modelo/driver
físico da impressora e do computador local — só precisa ser levantado
imediatamente antes do módulo 7, não bloqueia nada anterior.

## Fora deste backlog

Qualquer item listado em "Fora do MVP" em
[product/mvp-scope.md](product/mvp-scope.md) não entra neste backlog sem
solicitação explícita.
