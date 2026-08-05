# ADR 0002 — Adoção do Supabase (banco, autenticação e tempo real)

- **Status**: Aceita
- **Data**: 2026-08-04
- **Substitui parcialmente**: [ADR 0001](0001-decisoes-tecnicas-iniciais.md),
  itens 1 (tempo real), 2 (hospedagem) e 5 (autenticação). Os itens 3
  (impressão), 4 (Prisma/PostgreSQL) e 6 (multi-unidade) da ADR 0001
  continuam válidos.

## Contexto

Depois da ADR 0001, o usuário pediu para reavaliar o uso do Supabase antes de
seguir com a implementação. O ambiente de desenvolvimento atual também não
tem Docker disponível, o que tornaria o fluxo "Postgres local via Docker
Compose + VPS com Docker em produção" mais atrito do que o necessário para
uma operação pequena (6–8 mesas).

## Decisão

Adotar o **Supabase** como provedor de:

1. **Banco de dados** — PostgreSQL gerenciado pelo Supabase, acessado pela
   aplicação via **Prisma** (sem mudar o ORM nem o schema de domínio — ver
   [docs/database/schema.md](../../database/schema.md)). A aplicação usa duas
   connection strings: `DATABASE_URL` (via connection pooler do Supabase,
   para a aplicação em runtime) e `DIRECT_URL` (conexão direta, exigida pelo
   Prisma Migrate).
2. **Autenticação** — Supabase Auth substitui o Auth.js/credenciais
   próprias. Login por e-mail/senha continua sendo o método (mesmo
   requisito da seção 10 do `CLAUDE.md`), mas quem guarda a senha e emite a
   sessão é o Supabase, não a nossa tabela `User`.
3. **Tempo real** — Supabase Realtime (baseado em replicação lógica do
   Postgres + WebSocket gerenciado) substitui o WebSocket próprio.

## Por que

- **Custo**: o free tier do Supabase (banco, auth e realtime inclusos)
  cobre folgadamente o volume de uma operação de 6–8 mesas. É mais barato
  que o VPS de baixo custo da ADR 0001 (que já era pago, ainda que barato).
- **Complexidade operacional**: elimina a necessidade de gerenciar
  Postgres, processo de WebSocket e atualizações de SO em um VPS próprio.
  Não depende de Docker nem em desenvolvimento nem em produção — importante
  porque o ambiente de trabalho atual não tem Docker disponível.
- **Menos peças móveis**: um único provedor cobre três das seis decisões da
  ADR 0001, reduzindo a superfície de coisas que podem quebrar.

## Consequências

### Hospedagem da aplicação

Sem Postgres nem processo de WebSocket para hospedar junto, a aplicação
Next.js deixa de precisar de um VPS com processo long-lived só por causa
disso. **Hipótese**: hospedar em uma plataforma serverless de baixo custo
(ex. Vercel, plano gratuito/hobby) — reversível, revisar se o tráfego real
exigir outra coisa.

### Schema (`prisma/schema.prisma`)

`User.passwordHash` deixa de existir — o Supabase Auth guarda a credencial
em seu próprio schema (`auth.users`), que o Prisma não gerencia. `User`
passa a ter `authUserId` (o `id` do usuário em `auth.users`, um UUID),
único, como referência lógica — não é uma foreign key de banco de fato,
porque `auth.users` está fora do schema que o Prisma controla.

### Segurança — Row Level Security (RLS)

**Ponto de atenção real, não cosmético**: o Supabase expõe automaticamente
toda tabela do schema `public` via API REST/GraphQL (PostgREST), acessível
com a chave `anon`. Se RLS não estiver habilitado e com política
deny-by-default em cada tabela, dados financeiros e operacionais ficam
acessíveis publicamente por fora do backend Next.js. Ação obrigatória antes
de qualquer dado real entrar no banco:

1. Habilitar RLS em **todas** as tabelas do schema `public` assim que a
   primeira migration rodar;
2. Nenhuma política permissiva por padrão — o acesso de leitura/escrita
   direto ao Postgres via chave pública deve continuar bloqueado; o
   caminho oficial de escrita/leitura continua sendo o backend Next.js
   (regra 24/25 do `CLAUDE.md` — frontend nunca é a única camada de
   validação, permissões sempre no backend);
3. A aplicação, ao falar com o Prisma, usa a `DATABASE_URL`/`DIRECT_URL`
   com um usuário de banco que tem os privilégios necessários — isso não
   passa pela API REST do Supabase nem é afetado por RLS da mesma forma,
   mas manter RLS ativo é a rede de segurança contra qualquer uso futuro da
   API pública do Supabase (ex. se o Realtime for consumido direto do
   cliente).
4. Detalhar isso em `docs/database/schema.md` §"RLS" antes do Módulo 1
   (autenticação) rodar contra um banco Supabase real.

### Vendor lock-in

Trocar de provedor depois exige migrar Auth (usuários/senhas não saem do
Supabase em texto puro) e Realtime. Aceitável para o porte do projeto; se
um dia a MITIZ tiver múltiplas unidades e volume relevante, reavaliar.

### O que eu não fiz (e não posso fazer)

Não crio a conta/projeto Supabase — é uma ação de criação de conta que
cabe ao usuário. Ele criou o projeto e passou as credenciais; a partir daí,
o restante já foi executado (ver `docs/database/schema.md` §6):

1. ✅ Projeto criado pelo usuário em https://supabase.com;
2. ✅ `Project URL`, `anon key`, `service role key` e as duas connection
   strings de banco (pooled e direct) no `.env` local (não commitado);
3. ✅ `npm run prisma:migrate -- --name init` aplicado contra o Supabase
   real;
4. ✅ RLS habilitado em todas as tabelas.

Nota sobre o ambiente de execução: as portas diretas do Postgres (5432/6543)
não são alcançáveis pelo modo padrão do sandbox onde os comandos rodam
(só HTTPS/443 é permitido por padrão) — confirmado comparando uma chamada
HTTPS ao projeto (funcionou) com uma tentativa de TCP direto às portas do
Postgres (falhou). A migration só foi aplicada usando o modo que desativa
essa restrição de rede para este comando pontual, explicitamente para essa
finalidade.
