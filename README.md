# MITIZ Mesas

Sistema de gerenciamento de mesas, comandas, pedidos, produção e fechamento
de contas da MITIZ Boutique de Carnes.

> Status atual: **Módulo 4 concluído** (fundação + autenticação/permissões +
> cadastros básicos + mesas/atendimentos + pedidos — ver
> [backlog](docs/backlog.md)). Garçom já lança pedido completo (produto,
> quantidade, pessoa, adicionais, observação, ponto da carne), com preço
> congelado e saldo real da comanda; cancelamento em duas etapas com
> auditoria. Tempo real, produção, impressão, caixa e pagamentos vêm nos
> módulos seguintes.

## Documentação

Comece por [CLAUDE.md](CLAUDE.md) (especificação completa do produto) e:

- [docs/product/vision.md](docs/product/vision.md)
- [docs/product/mvp-scope.md](docs/product/mvp-scope.md)
- [docs/product/business-rules.md](docs/product/business-rules.md)
- [docs/architecture/overview.md](docs/architecture/overview.md)
- [docs/architecture/decisions/0001-decisoes-tecnicas-iniciais.md](docs/architecture/decisions/0001-decisoes-tecnicas-iniciais.md)
- [docs/database/schema.md](docs/database/schema.md)
- [docs/backlog.md](docs/backlog.md)

## Stack

TypeScript · Next.js (App Router) · React · PostgreSQL/Auth/Realtime via
**Supabase** · Prisma · Tailwind CSS · Zod · Vitest · Playwright. Detalhes e
justificativa em [docs/architecture/overview.md](docs/architecture/overview.md)
e [ADR 0002](docs/architecture/decisions/0002-adocao-supabase.md).

## Requisitos

- Node.js 20+
- Um projeto Supabase (gratuito) — criar em https://supabase.com. Não
  precisa de Docker nem de Postgres local.

## Primeiros passos

```bash
npm install
cp .env.example .env
```

Preencha o `.env` com os valores do seu projeto Supabase (Settings → API e
Settings → Database no painel), depois:

```bash
npx prisma migrate deploy
npm run prisma:seed
npm run dev
```

`prisma migrate dev` não funciona de forma confiável contra o pooler do
Supabase (ver [docs/database/schema.md §7](docs/database/schema.md)); as
migrations deste projeto já existem em `prisma/migrations/`, então
`migrate deploy` é o comando certo para aplicá-las.

⚠️ Antes de colocar qualquer dado real: habilitar Row Level Security em
todas as tabelas (ver
[docs/database/schema.md §2.9](docs/database/schema.md)).

Aplicação em `http://localhost:3000` — pede login (Supabase Auth). O seed
cria um usuário de teste (perfil Admin) e imprime as credenciais no
terminal; não é uma conta real, remova antes de operar com dados reais.
Para o seu usuário de verdade: crie em
_Supabase → Authentication → Users → Add user_ e rode
`npm run auth:link-admin -- --email=voce@exemplo.com --name="Seu Nome"`
(o script não vê nem pede sua senha).

## Scripts

| Comando                    | O que faz                                             |
| -------------------------- | ----------------------------------------------------- |
| `npm run dev`              | Sobe o servidor Next.js em desenvolvimento            |
| `npm run build`            | Build de produção                                     |
| `npm run lint`             | ESLint                                                |
| `npm run typecheck`        | `tsc --noEmit`                                        |
| `npm run format`           | Prettier (escreve)                                    |
| `npm test`                 | Testes unitários (Vitest, sem I/O)                    |
| `npm run test:integration` | Testes de integração (Vitest, batem no Postgres real) |
| `npm run test:e2e`         | Testes end-to-end (Playwright)                        |
| `npm run prisma:migrate`   | Cria/aplica uma migration em desenvolvimento          |
| `npm run prisma:seed`      | Popula dados de referência + usuário de teste         |
| `npm run auth:link-admin`  | Vincula um usuário Supabase existente ao perfil Admin |
| `npm run prisma:studio`    | Abre o Prisma Studio                                  |

## Estrutura de pastas

Ver detalhamento em
[docs/architecture/overview.md](docs/architecture/overview.md#6-estrutura-de-pastas-proposta).

```
src/
├── app/
│   ├── login/                # Tela de login (Módulo 1)
│   ├── admin/                  # Cadastros (Módulo 2)
│   ├── mesas/[id]/pedidos/       # Lançar/cancelar pedido (Módulo 4)
│   ├── mesas/                      # Mesas e atendimentos (Módulo 3)
│   ├── sem-permissao/                # Página de acesso negado (Módulo 2)
│   └── page.tsx                        # Home protegida (Módulo 1)
├── domain/
│   ├── auth/                             # Catálogo de permissões (Módulo 1)
│   ├── table/                              # Rótulos + "só abre mesa livre" (Módulos 2/3)
│   ├── service-session/                      # Máquina de estados do atendimento (Módulo 3)
│   └── order/                                  # Máquina de estados de pedido/item (Módulo 4)
├── application/
│   ├── auth/                                     # Usuário atual / permissão (Módulo 1)
│   ├── restaurant/                                 # Restaurant único (single-tenant) (Módulo 2)
│   ├── audit/                                        # Auditoria genérica (Módulo 4)
│   ├── service-session/                                # Abrir mesa, recalcular totais (Módulos 3/4)
│   └── order/                                            # Criar/cancelar pedido (Módulo 4)
├── infrastructure/                                         # Tempo real, impressão (vazio — Módulos 5/7)
├── components/form/                                          # Field/SubmitButton reutilizados (Módulo 2)
├── middleware.ts                                               # Proteção de rota (Módulo 1)
└── lib/
    ├── prisma.ts                                                 # Prisma Client singleton
    ├── env.ts                                                      # Validação de variáveis de ambiente
    ├── datetime.ts                                                   # Formatação em America/Sao_Paulo (Módulo 3)
    ├── money.ts                                                        # Decimal/BRL, nunca float (Módulo 4)
    └── supabase/                                                         # Clientes Supabase
prisma/
├── schema.prisma      # Modelagem completa do banco (Módulo 0)
├── seed.ts             # Dados de referência + usuário de teste (Módulo 1)
└── migrations/
scripts/
└── link-admin-user.ts  # Vincula sua conta real ao perfil Admin (Módulo 1)
tests/
├── unit/            # Puros, sem I/O — `npm test`
├── integration/       # Batem no Postgres real — `npm run test:integration`
├── e2e/                  # Playwright — `npm run test:e2e`
└── mocks/                  # Shims de teste (ex.: server-only)
```
