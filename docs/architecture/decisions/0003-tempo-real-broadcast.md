# ADR 0003 — Tempo real via Broadcast público do Supabase Realtime

- **Status**: Aceita
- **Data**: 2026-08-05
- **Relacionada**: [ADR 0002](0002-adocao-supabase.md) (adoção do Supabase,
  inclusive Realtime; e o RLS deny-by-default que esta ADR precisa respeitar)

## Contexto

O Módulo 5 (`docs/backlog.md`) pede atualização em tempo real: caixa e
produção devem ver mudanças de mesa/pedido sem recarregar a página
(CLAUDE.md seção 3 — "a operação não pode depender de atualização manual
da página").

O Supabase Realtime tem dois jeitos de fazer isso a partir de uma mudança
no banco:

1. **`postgres_changes`** — o cliente assina mudanças de uma tabela
   diretamente; o Realtime lê a replicação lógica do Postgres. O que cada
   cliente recebe é filtrado pelas policies de RLS da tabela.
2. **Broadcast** — mensagens explícitas em um canal nomeado, publicadas por
   quem quiser (servidor ou cliente), sem relação automática com uma
   tabela.

## Decisão

Usar **Broadcast**, publicado só pelo servidor (Next.js, com a service role
key), depois que a transação de negócio já commitou. O cliente nunca lê
dado do evento — só usa a chegada dele como gatilho para `router.refresh()`
(refetch do Server Component, que já passa pelas checagens de
permissão/RLS normais da aplicação).

- Canais nomeados por mesa (`table:{id}`) e por restaurante
  (`restaurant:{id}:tables`) — setor (`sector:{id}`) já está definido para
  quando o Módulo 6 (Produção) precisar;
- Payload do evento é só `{ type: "order.created" }` (ou equivalente) — sem
  valor monetário, nome de cliente ou qualquer dado de negócio;
- Canais são **públicos** (`private: false`) — não exigem policy de RLS em
  `realtime.messages`.

## Por que não `postgres_changes`

A ADR 0002 já registrou RLS deny-by-default em todas as tabelas como "ponto
de atenção real, não cosmético" — nenhuma tabela tem policy de leitura
liberada para a chave `anon`. `postgres_changes` herdaria essa mesma
restrição: sem abrir policy de SELECT nas tabelas envolvidas (`Table`,
`ServiceSession`, `Order`, `OrderItem`...) para o usuário autenticado via
Supabase Auth, nenhum evento chegaria a lugar nenhum. Abrir essas policies
list exigiria repetir, em SQL de RLS, a mesma lógica de permissão/escopo
por restaurante que já existe no backend Next.js (CLAUDE.md regra 25 —
"permissões devem ser verificadas no backend") — duas fontes de verdade
para a mesma regra, com risco real de divergirem.

Broadcast evita isso por completo: o dado nunca trafega pelo Realtime, só
o aviso de "algo mudou por aqui". O dado de verdade continua saindo
exclusivamente do Server Component, que já valida sessão e permissão do
jeito que sempre validou.

## Por que canais públicos (não privados)

Canal privado de Broadcast (`private: true`) também passa a exigir policy
de RLS em `realtime.messages` para autorizar quem pode entrar no canal —
de novo, a mesma duplicação de regra de permissão que a decisão acima
evitou. Como o payload nunca carrega dado de negócio, o pior cenário de um
canal público é alguém fora do sistema descobrir o nome do canal e:

- Receber o aviso "algo mudou na mesa X" sem nenhum dado além disso; ou
- Publicar um aviso falso, que na pior hipótese faz um cliente legítimo
  rodar um `router.refresh()` a mais (o Server Component por trás continua
  protegido por sessão/permissão normalmente).

Nenhum dos dois casos expõe ou corrompe dado real. Aceitável para o porte
do projeto; reavaliar (canal privado + policy dedicada) se o Realtime um
dia carregar algo mais sensível que um `type` textual.

## Publicação via REST, não WebSocket

O servidor publica com uma chamada HTTP simples
(`POST {SUPABASE_URL}/realtime/v1/api/broadcast`, com a service role key)
em vez de abrir uma conexão WebSocket, entrar no canal e só então enviar.
Uma server action do Next.js é um processo curto por requisição — manter
viva uma conexão WebSocket só para mandar uma mensagem e desconectar é
mais lento e mais frágil (timing de "esperar `SUBSCRIBED`") do que um POST
único. Falha de publicação nunca lança para quem chamou (regra: tempo real
é reforço de UX, não a fonte da verdade — a mutação já commitou antes de
chegar aqui); é só registrada com `console.error` para não ficar escondida.

## Consequências

- Nenhuma migration/policy de RLS nova é necessária para o Realtime
  funcionar;
- Cada mutação que deveria disparar uma atualização de tela (abrir mesa,
  criar pedido, cancelar/autorizar item) precisa lembrar de chamar
  `publishChange(...)` depois de commitar — não é automático como seria com
  `postgres_changes`. Ponto de atenção para módulos futuros (Módulo 8 —
  pagamentos, Módulo 9 — cancelamento/auditoria): ao adicionar uma mutação
  nova que devia refletir na tela em tempo real, adicionar o `publishChange`
  correspondente é parte do "definition of done" dessa mutação;
- O teste de round-trip completo (publica -> assina -> tela atualiza) foi
  verificado manualmente contra o Supabase real (duas abas do navegador),
  não com um teste automatizado de WebSocket — o projeto não tinha
  dependência de teste de componente React (jsdom/Testing Library) e somar
  uma só para isso não se justificava; o que é puro (nomes de canal) e o
  que é mockável sem rede real (a chamada de publicação) têm teste
  unitário em `tests/unit/realtime-channels.test.ts` e
  `tests/unit/realtime-publish.test.ts`.
