# Arquitetura de impressão (Módulo 7)

- **Status**: Implementada (MVP — impressora única).
- Decisão de hardware/topologia confirmada com o usuário em 2026-08-06:
  impressora térmica **Epson** (família ESC/POS padrão), conectada por
  **USB** a um computador Windows na rede local do restaurante.

Complementa a decisão já registrada em
[ADR 0001](../architecture/decisions/0001-decisoes-tecnicas-iniciais.md),
item 3: impressora térmica única, sem impressora por setor — o setor
continua sendo um dado do ticket, o roteamento físico é manual.

## Por que não imprimir direto do navegador

CLAUDE.md seção 20: "a impressão automática não deve depender da janela
padrão do navegador em cada pedido". Um `window.print()` disparado pelo
celular do garçom não tem como sair na impressora térmica do balcão — são
dispositivos diferentes, sem relação de rede assumível. Precisa de um
processo à parte, rodando **no mesmo computador da impressora**, que puxa
o trabalho da fila.

## Visão geral

```
Garçom envia pedido / Admin cancela item / alguém pede reimpressão
                    │
                    ▼
   Next.js (Vercel) grava PrintJob(status=PENDING, contentSnapshot=…)
                    │
                    │  HTTP autenticado (polling, não WebSocket —
                    │  o agente não precisa de porta aberta/entrada
                    │  na rede do restaurante, só sair)
                    ▼
     Agente local (Node.js, roda no PC ligado na Epson via USB)
                    │
                    ▼
        node-thermal-printer → spooler do Windows → impressora
                    │
                    ▼
      Agente confirma PRINTED ou FAILED (com o erro) de volta
```

O agente é um **processo separado do app Next.js**, fora do Vercel —
Vercel é serverless, não tem como manter uma porta USB aberta. O agente
mora em [`printer-agent/`](../../printer-agent/), tem seu próprio
`package.json`, e roda com `node agent.js` no computador do balcão.

## Autenticação do agente

Não usa a sessão do Supabase Auth (é para navegador, com cookie) nem a
`SUPABASE_SERVICE_ROLE_KEY` (poder demais para um script rodando num PC de
balcão — se aquele processo vazar, não deveria dar acesso a todo o banco).

Cada `Printer` tem um token próprio: `Printer.agentTokenHash` guarda só o
hash (SHA-256) do token — o valor em texto puro é mostrado **uma vez**,
na hora de gerar (tela `/admin/impressoras`), igual chave de API de
qualquer serviço. O agente manda esse token no header
`Authorization: Bearer <token>` em toda chamada; o servidor compara o hash.
Perder o token não expõe nada além da fila de impressão daquela impressora
(consultar/confirmar/falhar `PrintJob` — nunca dado financeiro).

## Ciclo de vida do `PrintJob`

Estados (`PrintJobStatus`, já no schema): `PENDING → PROCESSING → PRINTED`
ou `FAILED`. `CANCELLED` existe para quando o pedido inteiro é cancelado
antes de qualquer agente pegar o job (não implementado nesta primeira
versão — hoje um job de mesa cancelada só fica parado como `PENDING` sem
ninguem processar; ver "Fora do escopo desta versão" abaixo).

1. **Criação** — sempre dentro da mesma transação da ação que originou:
   - Pedido enviado (`createOrder`): um `PrintJob` do tipo `NEW_ORDER` **por
     setor presente no pedido** (se o pedido tem item de Parrilla e de Bar,
     nascem dois tickets) — é o que faz "Setor" ser um campo único no
     ticket, não uma lista (CLAUDE.md seção 20). Primeiro pedido do
     atendimento (`sequenceNumber === 1`) usa `NEW_ORDER`; pedidos
     seguintes na mesma mesa usam `COMPLEMENT` — mesmo formato de ticket,
     tipo diferente impresso nele, pra quem está na cozinha saber que é
     acréscimo, não repetição.
   - Item cancelado de fato (`authorizeCancelOrderItem`, não a solicitação):
     um `PrintJob` do tipo `CANCELLATION`, só para o setor daquele item —
     avisa quem está preparando para parar/não entregar.
   - Reimpressão manual (`/admin/impressao`, ação "Reimprimir"): tipo
     `REPRINT`, mesmo `contentSnapshot` do job original.
2. **`contentSnapshot`** é montado e congelado no momento da criação — se o
   nome do produto ou da mesa mudar depois, a reimpressão sai igual ao que
   foi impresso da primeira vez (mesmo racional do preço congelado em
   `OrderItem`, CLAUDE.md regra 9/10). Formato: JSON estruturado (não texto
   pronto) — quem decide o layout final (negrito, largura de coluna,
   corte de papel) é o agente, porque isso é detalhe de hardware, não
   regra de negócio. Ver `src/domain/printing/ticket.ts`.
3. **Consumo pelo agente** — `GET /api/print-jobs/pending`: busca jobs
   `PENDING` da impressora do token, marca como `PROCESSING` e devolve
   (claim atômico via `updateMany` condicionado ao status atual — evita
   dois agentes pegarem o mesmo job numa corrida, ainda que o MVP só tenha
   um agente rodando).
4. **Confirmação** — `PATCH /api/print-jobs/:id`:
   - `{ status: "PRINTED" }` — sucesso, grava `printedAt`;
   - `{ status: "FAILED", error: "..." }` — grava `lastError`, incrementa
     `attempts`, volta para fora da fila ativa mas visível em
     `/admin/impressao` para reprocessar manualmente.
5. **Reprocessamento** — ação manual no admin (`/admin/impressao`,
   "Reprocessar"): `FAILED → PENDING`, mesmo `contentSnapshot`, sem zerar
   `attempts` (histórico de tentativas continua visível).

## Conteúdo do ticket

Campos exigidos pela seção 20 do CLAUDE.md, todos presentes em
`TicketContent` (`src/domain/printing/ticket.ts`): nome do restaurante,
número do pedido, mesa, horário, garçom, setor, itens e quantidades,
pessoa (quando o item tem `Guest` vinculado), observações em destaque,
tipo do ticket.

## O agente (`printer-agent/`)

Node.js simples, sem framework — roda com `node agent.js`, configurado por
`.env` (URL do servidor, token, intervalo de polling). Usa
[`node-thermal-printer`](https://www.npmjs.com/package/node-thermal-printer)
(driver ESC/POS maduro, com suporte nomeado a Epson) apontando para o
compartilhamento da impressora no Windows (`interface: "printer:NOME"`,
depois de a Epson já estar instalada normalmente como impressora do
Windows — não precisa de driver adicional além do que o Windows já usa).

Detalhado em [`printer-agent/README.md`](../../printer-agent/README.md).

## O que eu não pude validar

Não tenho acesso à rede local nem à impressora física do usuário — o
agente foi escrito contra a documentação da `node-thermal-printer` e o
funcionamento do ESC/POS padrão Epson, mas **não foi impresso em papel de
verdade por mim**. Rodar e confirmar num ticket real é o próximo passo, do
lado do usuário; ajustes finos de layout (largura de coluna, corte,
gaveta) vêm depois desse primeiro teste.

## Fora do escopo desta versão (registrado, não esquecido)

- Cancelar o `PrintJob` de um pedido/item quando a mesa inteira é cancelada
  antes de qualquer agente processá-lo (hoje fica `PENDING` órfão — raro,
  mas existe);
- Múltiplas impressoras / mais de um agente (schema já suporta, UI/lógica
  de roteamento por setor físico não);
- Abertura de gaveta de dinheiro pela impressora (comum em Epson TM-T20/
  T88, mas não pedido).
