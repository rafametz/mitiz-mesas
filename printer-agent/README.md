# Agente local de impressão — MITIZ Mesas

Programa pequeno que roda no computador ligado na impressora térmica
(Epson, USB) e imprime os tickets que o app manda (pedido novo, complemento,
cancelamento, reimpressão). Não faz parte do app Next.js/Vercel — é
**separado de propósito**, porque o Vercel é serverless e não tem como
falar com uma porta USB. Arquitetura completa em
[`docs/printing/architecture.md`](../docs/printing/architecture.md), no
projeto principal.

## O que você precisa antes de começar

1. A impressora Epson já instalada normalmente no Windows (o instalador que
   veio com ela, ou o Windows já reconheceu como impressora USB).
2. [Node.js](https://nodejs.org) instalado nesse mesmo computador (baixe a
   versão "LTS").
3. Um token gerado no app, em **Administração → Impressoras → (sua
   impressora) → Editar → Gerar novo token**. Ele só aparece em texto uma
   vez — copie na hora.
4. O **alvo de impressão** (compartilhamento ou porta) — ver seção
   "Descobrir o alvo da impressora" abaixo antes de preencher o `.env`.

## Instalação

1. Copie a pasta `printer-agent` inteira para o computador do balcão (pen
   drive, e-mail, o que for mais fácil).
2. Abra um terminal (PowerShell) dentro da pasta e rode:

   ```
   npm install
   ```

3. Copie `.env.example` para `.env` e preencha:

   ```
   copy .env.example .env
   ```

   Abra o `.env` num editor de texto e preencha:
   - `SERVER_URL` — o endereço do app (ex.: `https://mitiz-mesas.vercel.app`);
   - `PRINT_AGENT_TOKEN` — o token que você gerou;
   - `PRINTER_TARGET` — ver "Descobrir o alvo da impressora" logo abaixo.

4. Rode:

   ```
   npm start
   ```

   Deve aparecer algo como:

   ```
   Agente de impressão MITIZ — servidor: https://mitiz-mesas.vercel.app
   Impressora (copy /b): \\localhost\EPSON — consultando a cada 5000ms
   ```

   Se aparecer isso e não der erro, está funcionando — deixe essa janela
   aberta. Mande um pedido pelo app (de qualquer celular) e o ticket deve
   sair na impressora em até 5 segundos.

## Descobrir o alvo da impressora (`PRINTER_TARGET`)

O agente manda os bytes crus (ESC/POS) pra impressora com o comando nativo
`copy /b` do Windows — **não instala nenhum driver de terceiro** (a
primeira versão tentava um pacote chamado `printer`, que é antigo, mal
mantido e não instala sem Visual Studio Build Tools; foi trocado por isso
de propósito). Duas formas de apontar pra impressora certa, escolha uma:

**Opção A — compartilhar a impressora (mais simples)**

1. Painel de Controle → Dispositivos e Impressoras;
2. Botão direito na Epson → Propriedades da impressora → aba
   "Compartilhamento";
3. Marcar "Compartilhar esta impressora" e anotar o **Nome do
   compartilhamento** (ex.: `EPSON`);
4. `PRINTER_TARGET="\\localhost\EPSON"` (troque `EPSON` pelo nome que você
   deu).

**Opção B — porta direta (sem compartilhar nada)**

1. Painel de Controle → Dispositivos e Impressoras → botão direito na
   Epson → Propriedades da impressora → aba "Portas";
2. Anote a porta marcada (geralmente `USB001`, `USB002`...);
3. `PRINTER_TARGET="USB001"` (o valor exato que você viu ali).

Se depois de configurado o `npm start` conseguir escrever mas nada sair no
papel, teste o mesmo `copy /b` direto no PowerShell com um arquivo de
texto qualquer — se isso também não imprimir, o problema é o
compartilhamento/porta escolhido, não o agente:

```
echo teste > teste.txt
copy /b teste.txt \\localhost\EPSON
```

## Deixar rodando sempre (sem precisar abrir o terminal manualmente)

Isso é opcional — enquanto estiver testando, é mais simples só deixar a
janela do `npm start` aberta. Quando já estiver funcionando bem, dá pra
configurar pra iniciar sozinho:

- **Mais simples**: colocar um atalho para `npm start` (dentro da pasta
  `printer-agent`) na pasta de Inicialização do Windows
  (`shell:startup` na barra de endereço do Explorer).
- **Mais robusto** (reinicia sozinho se cair): instalar o
  [PM2](https://pm2.keymetrics.io/) (`npm install -g pm2`) e rodar
  `pm2 start agent.js --name mitiz-print-agent`, depois
  `pm2 save` e `pm2-startup install` (o pm2 explica o comando exato pro
  Windows quando você roda `pm2 startup`).

## Se não imprimir — checklist

1. **A janela do agente mostra `[falha] job ...` com uma mensagem sobre
   "não pode encontrar" ou "acesso negado"** — o `PRINTER_TARGET` no
   `.env` está errado, ou (se for compartilhamento) o compartilhamento foi
   desativado. Revise a seção "Descobrir o alvo da impressora" acima e
   teste o `copy /b` manual sugerido lá. Se a Epson estiver desligada, sem
   papel ou com o cabo solto, teste primeiro uma página de teste direto
   pelo Windows (Dispositivos e Impressoras → botão direito → Propriedades
   → Imprimir página de teste).
2. **`Token inválido (401)`** — o token foi regenerado (isso invalida o
   anterior na hora) ou foi digitado errado no `.env`. Gere um novo em
   `/admin/impressoras` e atualize o `.env`.
3. **Nada aparece na janela, trava logo no início** — confira `SERVER_URL`
   no `.env` (sem barra no final) e se o computador tem internet.
4. **Imprime, mas o texto sai cortado ou com espaço sobrando nas bordas**
   — ajuste `width` em `agent.js` (linha perto do topo, comentada): 42 é
   para bobina de 80mm, ~32 para bobina de 58mm.
5. **Qualquer outro erro** — a mensagem completa aparece na janela do
   terminal (`[falha] job <id>: <mensagem>`). Copie e leve pra quem estiver
   ajustando o sistema — o texto do erro é o que mais importa pra
   diagnosticar.

## O que este script faz (e o que não faz)

- Consulta `GET {SERVER_URL}/api/print-jobs/pending` a cada
  `POLL_INTERVAL_MS`, autenticado com o token;
- Cada job vem pronto (conteúdo já montado pelo servidor) — o agente só
  decide o *layout* (negrito, corte, largura);
- Confirma sucesso ou falha de volta pro servidor
  (`PATCH /api/print-jobs/:id`) — uma falha nunca trava o agente, ele
  segue pro próximo job e tenta esse de novo só se alguém mandar
  reprocessar pela tela `/impressao` do app;
- Não abre nenhuma porta, não aceita conexão de fora — só faz requisições
  de saída. Não precisa mexer em firewall nem configurar rede.
