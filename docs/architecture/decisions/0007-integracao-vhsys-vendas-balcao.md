# ADR 0007 — Integração com a VHSYS (Vendas Balcão/PDV)

- **Status**: Aceita (Fase 1 implementada; Fase 2 aguardando aprovação)
- **Data**: 2026-08-25 (análise) / 2026-08-28 (Fase 1)
- **Relacionada**: CLAUDE.md §21 (integração futura com PDV)

## Contexto

Pedido do usuário: quando um atendimento do MITIZ Mesas é efetivamente
fechado, a mesma venda deve ser criada automaticamente no módulo Vendas
Balcão (PDV) da VHSYS (`https://api.vhsys.com/v2`), eliminando o
lançamento manual duplicado nos dois sistemas.

Antes de qualquer código, foi feita uma análise completa (documentação
oficial da VHSYS + modelo de dados do MITIZ Mesas) cobrindo endpoints
necessários, sequência de chamadas, vínculo de produtos, tratamento de
desconto/taxa/pagamentos múltiplos, status final, idempotência,
comportamento com a VHSYS offline, reprocessamento, dados a armazenar,
telas administrativas e riscos da documentação — aprovada pelo usuário
em 2026-08-25, com um ajuste de escopo confirmado em seguida: **o MITIZ
Mesas hoje não aplica taxa de serviço nem desconto neste tipo de venda**,
então esses dois campos ficam irrelevantes na prática (continuam
suportados pela integração, só não são um caso testado no dia a dia).

## Decisão

Implementação em fases, não tudo de uma vez (CLAUDE.md §16):

### Fase 1 (implementada nesta revisão) — vínculo de produtos

Pré-requisito de tudo o que vem depois: sem um `id_produto` da VHSYS
gravado em cada `Product` do MITIZ, não há como montar a venda balcão sem
resolver produto por nome (explicitamente rejeitado pelo usuário).

- **Schema**: `Product.vhsysProductId Int?` — nulo até alguém vincular
  manualmente. Nenhuma outra tabela nova ainda (a Fase 2 traz o resto:
  `VhsysSalesSync`, `PaymentMethod.vhsysFormaPagamento`).
- **Cliente HTTP** (`src/lib/vhsys/client.ts`): só `GET /produtos`
  (`listVhsysProducts`) por enquanto — é a única chamada necessária pra
  este vínculo. Credenciais (`VHSYS_ACCESS_TOKEN`,
  `VHSYS_SECRET_ACCESS_TOKEN`) em variável de ambiente, mesmo padrão já
  usado para o Supabase neste projeto — nunca em texto puro em código,
  banco ou documentação (CLAUDE.md §14). Checadas só quando a função é
  chamada, nunca na inicialização do processo: a integração é opcional
  até alguém configurar, e isso nunca pode travar o boot do app.
- **Tela admin** (`/admin/integracoes/vhsys`, permissão `ADMIN_MANAGE`,
  reaproveitada — sem permissão nova): busca produtos já cadastrados na
  VHSYS por nome (referência, somente leitura) e um formulário por
  produto do MITIZ pra colar o `id_produto` correspondente. Vínculo
  **sempre manual e explícito** — nunca resolvido automaticamente por
  nome, nem nesta tela nem (quando a Fase 2 existir) no momento da venda.
- Nada no fluxo de fechamento de mesa foi alterado — esta fase é somente
  cadastro/mapeamento, sem nenhum gatilho automático ainda.

### Fase 2 (não implementada — aguardando novo pedido do usuário)

Criação automática da Venda Balcão ao fechar o atendimento
(`POST /vendas-balcao` + `.../produtos` + `.../parcelas` +
`.../status`), com:

- Novo model `VhsysSalesSync` (1:1 com `ServiceSession`) com estados
  próprios (`PENDING`/`PROCESSING`/`SYNCED`/`ERROR`), rastreando cada
  sub-etapa enviada (idempotência: retry nunca reenvia o que já foi
  confirmado).
- Disparo assíncrono após `closeTable()` (`runAfterResponse`, mesmo
  padrão já usado pro tempo real) — a integração externa **nunca**
  bloqueia nem depende da disponibilidade da VHSYS pra fechar a mesa
  localmente.
- Múltiplos pagamentos do mesmo atendimento (ex.: Pix + Débito +
  Dinheiro) viram múltiplas linhas no array de `.../parcelas`, cada uma
  com sua própria forma de pagamento e valor. O campo `forma_pagamento`
  do cabeçalho da venda (string única, não representa múltiplas formas)
  é preenchido só como informativo, com a forma de maior valor —
  **confirmado como irrelevante pelo usuário** (não é um dado usado por
  eles hoje).
- Desconto/taxa: `desconto_pedido`/`acrescimo_pedido` mapeiam direto de
  `session.discountAmount`/`serviceChargeAmount` — implementado porque o
  campo existe e o cálculo já é trivial, mas **sem relevância prática
  hoje**, já que a operação atual não usa essas modalidades nesse tipo de
  venda (confirmado pelo usuário 2026-08-28).
- Reprocessamento via tentativa imediata + Vercel Cron como rede de
  segurança + botão manual "tentar novamente" na tela admin.
- Nunca cria produto novo na VHSYS nem emite NFC-e/NF-e nesta versão.

**Restrição de teste explícita do usuário**: nenhum teste automatizado
pode criar uma venda de verdade no PDV real da VHSYS (evoluiria o
sistema de produção deles). Qualquer teste manual que efetivamente
lançar uma venda no ambiente real precisa ser estornado/cancelado
depois, manualmente, pela própria VHSYS.

## Consequências

- Produto sem vínculo nunca bloqueia o fechamento local da mesa (Fase 1
  e 2) — só impede aquele item específico de entrar numa venda VHSYS
  quando a Fase 2 existir, com erro claro pra quem cadastra.
- A tela de vínculo é reaproveitável mesmo antes da Fase 2 existir: dá
  pra já ir cadastrando os vínculos com calma, sem pressa de ativar
  sincronização nenhuma.
- Se a VHSYS mudar sua API (ela é a única fonte de verdade sobre o
  formato real de request/response — a documentação tinha
  inconsistências observadas na análise, ex.: `Content-Type` diferente
  entre endpoints, tipo `boolean` claramente errado num campo de
  resposta), a Fase 2 precisa validar essas chamadas em sandbox antes de
  ir pra produção.
