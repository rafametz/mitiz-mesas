# ADR 0001 — Decisões técnicas iniciais

- **Status**: Parcialmente substituída. Itens 1 (tempo real), 2
  (hospedagem) e 5 (autenticação) foram substituídos pela
  [ADR 0002](0002-adocao-supabase.md). Itens 3 (impressão), 4
  (Prisma/PostgreSQL) e 6 (multi-unidade) continuam válidos.
- **Data**: 2026-08-04

## Contexto

Em [overview.md](../overview.md) foram levantadas 6 decisões técnicas
pendentes antes de iniciar os módulos de tempo real e impressão do
[backlog](../../backlog.md). A operação é pequena (6–8 mesas), então o
critério de desempate, quando havia mais de uma opção razoável, foi
**menor custo e menor complexidade operacional**.

## Decisões

1. **Tempo real — WebSocket próprio**, sem serviço gerenciado
   (Pusher/Ably/Supabase Realtime). Roda no mesmo servidor da aplicação.
   Custo zero adicional; aceitável em baixa escala.

2. **Hospedagem — um único servidor (VPS) de baixo custo**, com aplicação
   Next.js, processo de WebSocket e Postgres rodando via Docker Compose no
   mesmo host. Evita múltiplos serviços gerenciados pagos. Reavaliar se a
   carga crescer (múltiplas unidades, muito mais tráfego) — nesse caso
   separar banco para um Postgres gerenciado é a primeira extração natural.

3. **Impressão — impressora térmica única, local, conectada por USB/rede a
   um computador local**, na mesma rede local dos demais dispositivos
   (celulares dos garçons, tablets da produção, caixa). Não há uma
   impressora por setor: todo `PrintJob`, independente do setor de destino
   (cozinha, parrilla, bar), é impresso nessa única impressora — o setor
   continua sendo um dado do pedido (aparece destacado no ticket impresso),
   apenas o roteamento físico dos setores passa a ser manual (quem retira o
   ticket na impressora leva até o setor certo).
   Consequência para o domínio: `Printer` continua modelado (para permitir
   evoluir para múltiplas impressoras no futuro sem migração de schema),
   mas o MVP terá exatamente um registro de `Printer` ativo. O agente local
   de impressão roda nesse computador e consome a fila via polling
   HTTP autenticado (ver módulo 7 do backlog e futuro
   `docs/printing/architecture.md`).

4. **Banco de dados — Prisma + PostgreSQL**, conforme proposto, sem
   necessidade de compatibilidade com outro projeto/sistema existente.

5. **Autenticação — usuário/senha simples via Auth.js**, sem PIN rápido por
   enquanto (pode ser adicionado depois sem quebrar o modelo de `User`).

6. **Multi-unidade — modelar `Restaurant`/`Venue` desde já no schema**, com
   uma única linha ativa, sem seletor de unidade na UI do MVP. Custo de
   implementação é o mesmo de não modelar; evita migração futura.

## Consequências

- `docs/architecture/overview.md` atualizado: as 6 decisões antes marcadas
  `[DECISÃO PENDENTE]` agora estão confirmadas.
- `docs/backlog.md` atualizado: módulos 5 (tempo real) e 7 (impressão)
  não têm mais decisão bloqueando o início, quando chegar a vez deles.
- Item ainda em aberto, não bloqueante: modelo/marca física da impressora
  térmica e do computador local (define detalhes finos do agente — ex.:
  driver ESC/POS específico). Levantar isso apenas quando o módulo 7 for
  iniciado.
- Nenhum código foi escrito a partir desta ADR; ela apenas registra a
  decisão para orientar os módulos 5 e 7 do backlog.
