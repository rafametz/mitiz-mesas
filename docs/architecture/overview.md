# Arquitetura — Visão Geral (MITIZ Mesas)

> Status: **proposta inicial, decisões técnicas confirmadas em 2026-08-04**
> (ver [ADR 0001](decisions/0001-decisoes-tecnicas-iniciais.md) e
> [ADR 0002](decisions/0002-adocao-supabase.md)). Fundação do projeto e
> modelagem do banco já implementadas (Módulo 0); demais módulos ainda não.

## 1. Stack proposta

Conforme seção 12 do `CLAUDE.md` (stack preferencial), sem contradizer nada
existente (repositório vazio):

| Camada       | Escolha proposta                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Linguagem    | TypeScript em todo o projeto                                                                                                                |
| Frontend     | Next.js (App Router) + React                                                                                                                |
| Estilo       | Tailwind CSS, componentes acessíveis (Radix UI ou similar)                                                                                  |
| Backend      | Route Handlers do Next.js, com camada de serviços separada do transporte HTTP                                                               |
| Banco        | PostgreSQL gerenciado pelo **Supabase**                                                                                                     |
| ORM          | Prisma (conectado ao Postgres do Supabase)                                                                                                  |
| Autenticação | **Supabase Auth** (e-mail/senha)                                                                                                            |
| Tempo real   | **Supabase Realtime**                                                                                                                       |
| Validação    | Zod, compartilhado entre client e server                                                                                                    |
| Testes       | Vitest (unit/integration) + Playwright (E2E dos fluxos críticos)                                                                            |
| Impressão    | Impressora térmica única, local, com agente que consome fila de `PrintJob` — ver [../printing/architecture.md](../printing/architecture.md) |
| Hospedagem   | Plataforma serverless de baixo custo (ex. Vercel, plano gratuito) — não depende mais de VPS/Docker                                          |

Justificativa: é a stack sugerida no `CLAUDE.md`, madura para times pequenos,
com bom suporte a TypeScript ponta a ponta, App Router permite colocar
UI e Route Handlers no mesmo projeto, e Prisma dá migrations + tipagem
segura para regras financeiras. Banco, autenticação e tempo real via
Supabase conforme [ADR 0002](decisions/0002-adocao-supabase.md) — menor
custo (free tier cobre a escala da MITIZ) e menor complexidade operacional
(sem Postgres, WebSocket ou VPS para administrar).

## 2. Decisões confirmadas

Confirmadas em 2026-08-04 com o usuário, priorizando **menor custo e menor
complexidade operacional** (operação pequena, 6–8 mesas). Detalhe e
justificativa completos em
[ADR 0001](decisions/0001-decisoes-tecnicas-iniciais.md) e
[ADR 0002](decisions/0002-adocao-supabase.md) (esta substitui os itens 1, 2
e 5 abaixo).

1. **Tempo real — Supabase Realtime**, sem processo de WebSocket próprio
   para operar.

2. **Hospedagem — plataforma serverless de baixo custo** (ex. Vercel, plano
   gratuito) para a aplicação Next.js. Sem VPS nem Docker em produção — o
   Postgres, a autenticação e o tempo real são todos geridos pelo Supabase.

3. **Impressão — impressora térmica única**, local, conectada a um
   computador local, na mesma rede local dos demais dispositivos (celulares
   dos garçons, tablets de produção, caixa). Não há impressora por setor:
   todo `PrintJob` é impresso nessa única impressora, com o setor de destino
   destacado no próprio ticket — o roteamento físico até a cozinha/parrilla/
   bar passa a ser manual. `Printer` continua modelado no domínio (permite
   evoluir para múltiplas impressoras depois sem migração), mas o MVP terá
   um único registro ativo.

4. **Banco de dados — Prisma + PostgreSQL**, agora hospedado pelo Supabase
   em vez de self-hosted, sem necessidade de compatibilidade com outro
   projeto/sistema existente.

5. **Autenticação — Supabase Auth**, e-mail/senha, sem PIN rápido por
   enquanto (pode ser adicionado depois sem quebrar o modelo de `User`).

6. **Multi-unidade — `Restaurant`/`Venue` modelado desde já** no schema, uma
   única linha ativa, sem seletor de unidade na UI do MVP.

Item ainda em aberto, não bloqueante: modelo/marca física da impressora
térmica e do computador local (detalhe fino do agente, ex. driver ESC/POS
específico) — levantar apenas quando o módulo 7 do backlog for iniciado.

## 3. Estrutura de domínio

Conforme seção 13 do `CLAUDE.md`: `User`, `Role`, `Permission`, `Table`,
`ServiceSession`, `Guest`, `Category`, `Product`, `ProductModifierGroup`,
`ProductModifier`, `ProductionSector`, `Order`, `OrderItem`,
`OrderItemModifier`, `Payment`, `PaymentMethod`, `Discount`, `ServiceCharge`,
`Printer`, `PrintJob`, `AuditLog`.

Nomes técnicos em inglês no código; textos de interface em português.

## 4. Separação de camadas

```
apresentação (UI, React)
        │
        ▼
camada de aplicação (casos de uso / serviços) ← validação com Zod, permissões
        │
        ▼
domínio (regras de negócio puras, sem I/O)
        │
        ▼
infraestrutura (Prisma/Postgres, WebSocket, fila de impressão)
```

Route Handlers do Next.js permanecem finos: parseiam/validam entrada,
verificam permissão, chamam um serviço de aplicação, devolvem resposta.
Regras de negócio (ex.: cálculo de saldo, validação de transição de estado)
vivem na camada de domínio, testáveis sem banco.

## 5. Tempo real — desenho preliminar

- Toda mutação relevante (pedido criado, status mudou, pagamento registrado,
  mesa fechada) publica um evento após a transação de banco confirmar
  (nunca antes — evita estado fantasma se a transação falhar);
- Eventos são escopados por canal: por mesa (`table:{id}`), por setor de
  produção (`sector:{id}`) e um canal geral do caixa;
- Cliente se inscreve apenas nos canais relevantes ao seu perfil/tela;
- Reconexão automática no cliente; ao reconectar, refetch do estado atual
  (o evento é um gatilho de atualização, não a única fonte de verdade) —
  isso também cobre internet local instável.

## 6. Estrutura de pastas proposta

```
mitiz-mesas/
├── CLAUDE.md
├── docs/
│   ├── product/
│   │   ├── vision.md
│   │   ├── mvp-scope.md
│   │   └── business-rules.md
│   ├── architecture/
│   │   ├── overview.md
│   │   └── decisions/          # ADRs (0001-..., 0002-...)
│   ├── database/
│   │   └── schema.md
│   ├── printing/
│   │   └── architecture.md
│   ├── testing/
│   │   └── strategy.md
│   └── backlog.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/login/
│   │   ├── (staff)/mesas/
│   │   ├── (staff)/mesas/[tableId]/
│   │   ├── (staff)/producao/
│   │   ├── (staff)/caixa/
│   │   ├── (staff)/admin/
│   │   └── api/                # Route Handlers (ou usar Server Actions)
│   ├── domain/                 # regras de negócio puras, por agregado
│   │   ├── table/
│   │   ├── service-session/
│   │   ├── order/
│   │   ├── payment/
│   │   └── printing/
│   ├── application/            # casos de uso, orquestram domínio + infra
│   ├── infrastructure/
│   │   ├── db/                 # cliente Prisma, repositórios
│   │   ├── realtime/           # publisher/subscriber de eventos
│   │   └── printing/           # integração com fila de PrintJob
│   ├── components/             # componentes de UI reutilizáveis
│   └── lib/
│       ├── prisma.ts           # Prisma Client singleton
│       ├── env.ts              # validação de variáveis de ambiente
│       └── supabase/           # clientes Supabase (browser/server/service role)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
└── package.json
```

Ajustar conforme a stack de tempo real e o agente de impressão forem
decididos (item pode virar um serviço/processo separado, com seu próprio
`package.json`, em vez de subpasta de `src/`).

## 7. Riscos

### Tempo real

- **Fan-out sob carga**: poucas mesas, mas múltiplos clientes por mesa
  (garçom, caixa, produção) — baixo risco de volume, mas cada evento mal
  escopado pode gerar re-render desnecessário no celular do garçom.
  Mitigação: canais por mesa/setor, não broadcast global.
- **Conexão instável em Wi-Fi/4G do restaurante**: cliente pode perder
  eventos durante desconexão. Mitigação: ao reconectar, sempre refazer fetch
  do estado atual em vez de confiar em replay de eventos.
- **Limites do free tier do Supabase Realtime** (conexões simultâneas,
  mensagens/mês): baixo risco no volume da MITIZ, mas deve ser monitorado
  se o número de dispositivos conectados crescer (múltiplas unidades, por
  exemplo).

### Supabase (banco, autenticação, tempo real) — ver ADR 0002

- **Exposição indevida via API pública do Supabase**: toda tabela do schema
  `public` é exposta por padrão via PostgREST. Sem Row Level Security (RLS)
  habilitado e restritivo em todas as tabelas, dados financeiros/operacionais
  ficariam acessíveis por fora do backend Next.js. Mitigação: habilitar RLS
  deny-by-default em todas as tabelas antes de qualquer dado real existir —
  ver [ADR 0002](decisions/0002-adocao-supabase.md#segurança--row-level-security-rls).
- **Vendor lock-in**: migrar Auth e Realtime para outro provedor no futuro
  exige trabalho de migração (não é só trocar `DATABASE_URL`). Aceitável
  para o porte atual do projeto.
- **Dependência de serviço externo para autenticação e tempo real**: se o
  Supabase tiver indisponibilidade, login e atualizações em tempo real
  param mesmo com a aplicação no ar. Sem mitigação própria no MVP — risco
  aceito dado o SLA do provedor e o porte da operação.

### Concorrência

- **Duas ações simultâneas na mesma mesa** (dois garçons lançando pedido, ou
  caixa fechando enquanto pedido é enviado). Mitigação: transações no banco
  com isolamento adequado, checagem de estado da `ServiceSession` dentro da
  transação (não antes), e idempotência por chave de requisição.
- **Duplo toque em celular com rede lenta**: requisição crítica sem chave de
  idempotência pode duplicar pedido/pagamento. Mitigação: seção 8, regra 19
  do `CLAUDE.md` — obrigatório desde o primeiro endpoint crítico.

### Pagamentos

- **Arredondamento em divisão de conta** (por pessoa/igualmente): soma das
  partes pode não bater centavo a centavo com o total. Precisa de regra
  determinística de resto (ex.: sobra vai para a última parcela) e teste com
  valores exatos.
- **Fechamento com saldo poeira** (ex. R$ 0,01 por arredondamento de taxa):
  decidir tolerância explícita ou eliminação via ajuste registrado — nunca
  fechar "no olho".
- **Concorrência em pagamento parcial**: dois pagamentos quase simultâneos
  não podem, juntos, ultrapassar o saldo sem que isso fique registrado como
  situação a resolver.

### Impressão automática

- **Agente local indisponível, computador desligado ou impressora sem
  papel**: pedido não pode ficar "perdido" — `PrintJob` permanece
  `FAILED`/`PENDING` e visível para reprocessamento manual, e a mesa/
  produção precisa de um indicador de que algo não imprimiu.
- **Impressora única é ponto único de falha de todo o fluxo de produção**:
  se ela travar, cozinha/parrilla/bar param de receber pedidos impressos ao
  mesmo tempo. Mitigação: a tela de produção de cada setor deve funcionar
  mesmo sem a impressão (o pedido já está visível no sistema assim que
  enviado, a impressão é um reforço físico, não a única fonte).
- **Mistura de setores no mesmo ticket físico**: como todos os setores saem
  na mesma impressora, o destaque visual do setor no ticket é essencial para
  evitar que alguém leve um item de bar para a parrilla por engano.
- **Duplicidade de impressão** em reprocessamento manual: reimpressão deve
  ser uma ação explícita e auditada, não uma consequência de reload de página.
- **Definição tardia de hardware/protocolo de impressora**: modelo/driver
  específico (ESC/POS local vs. outro) ainda não levantado — não deve
  bloquear os módulos anteriores, só o módulo 7.

## 8. Referências

[../product/vision.md](../product/vision.md) ·
[../product/mvp-scope.md](../product/mvp-scope.md) ·
[../product/business-rules.md](../product/business-rules.md) ·
[../backlog.md](../backlog.md)
