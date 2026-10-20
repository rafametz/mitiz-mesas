# ADR 0010 — Pagamento Combinado (Mesa + PDV)

- **Status**: **Aprovada (2026-10-15)**. Decisões: (1) forma de pagamento
  por origem é **manual**, o operador escolhe separadamente pra mesa e
  pra loja — sem divisão automática "mesa primeiro"; (2) sessão do PDV
  **fecha sozinha** ao atingir saldo zero, sem passar por "solicitar
  fechamento"; (3) nome do modelo novo confirmado: `CombinedCheckout`;
  (4) devolução física de produto confirmada fora de escopo (só estorno
  de pagamento). Implementação começando pelo passo 1 da seção 15
  (extração estrutural de `registerPayment`/`createOrder`).
- **Data**: 2026-10-15
- **Relacionada**: ADR 0004 (separação pagamento/fechamento), ADR 0006
  (pagamento por itens e rateio), `docs/product/visao-mitiz-gestao.md`
  (Fase 2 — PDV, em andamento), `docs/backlog.md` Módulo 17.
- **Estado do PDV no momento deste pedido**: só o passo 1 (schema —
  `ServiceSessionType.PDV`, permissão `pdv.sell`) está implementado.
  Nenhuma tela, nenhum carrinho, nenhum fechamento ainda existem — este
  pedido chega **antes** de qualquer um deles ser construído, então não
  há nada para refazer (seção 12 do pedido original).

---

## 1. Como entendi o Pagamento Combinado

Um cliente numa mesa quer, no momento de pagar a parte dele, **também**
levar um produto da loja (ex.: uma picanha). Hoje isso exigiria dois
atendimentos separados — fechar parte da conta na mesa, depois um
pagamento à parte na loja. O pedido é que o caixa resolva isso **numa
operação só**: um carrinho que mistura "consumo de mesa selecionado" com
"produto de loja", um recebimento único (uma ou mais formas de
pagamento), e o sistema distribui o valor corretamente para as duas
origens, sem duplicar nada e sem fechar a mesa.

## 2. Como isso se encaixa no PDV em desenvolvimento

Perfeitamente, e sem conflito com a decisão arquitetural já tomada na
Fase 2 (reaproveitar `ServiceSession`/`Order`/`OrderItem`/`Payment`, não
criar um sistema de vendas paralelo). O Pagamento Combinado **não muda**
essa decisão — ele é uma consequência natural dela: se mesa e PDV já
usam a mesma `ServiceSession` por baixo, "pagar os dois juntos" é uma
questão de **registrar dois `Payment`, um em cada sessão, dentro da
mesma transação**, não de inventar um terceiro conceito de venda.

## 3. Como ficará a experiência do operador

Exatamente como descrito no pedido (seção 11):

```
Abrir PDV → "+ Adicionar consumo de mesa" → selecionar mesa →
selecionar itens/frações → confirmar seleção (volta pro carrinho) →
continuar passando produtos da loja → Receber → forma(s) de pagamento →
Confirmar
```

Nenhuma etapa nova de "fechar pagamento da mesa" e depois "abrir
pagamento do PDV" — é um fluxo só, do início ao fim.

## 4. Como será feita a seleção do consumo da mesa

**Reaproveitando a tela/lógica que já existe**, não criando uma segunda
(pedido explícito do usuário, seção 3). Hoje, `/mesas/[id]/pagamentos/novo`
já tem exatamente essa seleção — unidades de item, item inteiro, fração
de um item dividido ("Dividir"/"Redistribuir"), valor personalizado,
tudo revalidado no servidor contra o saldo real (ADR 0006). A ação "+
Adicionar consumo de mesa" do PDV abre **o mesmo componente de seleção**,
só que embutido no fluxo do PDV em vez do fluxo da própria mesa. A
seleção continua sendo só rascunho local até a confirmação final (pedido
explícito, seção 8) — nada é gravado até o "Receber" ser confirmado.

## 5. Como o carrinho exibirá mesa e produtos da loja

O carrinho do PDV (hoje ainda não construído) precisa reconhecer dois
tipos de linha visualmente agrupados — "Mesa 01 — R$ 56,00" (com o
detalhe do que foi selecionado) e "Loja — R$ 110,00" (os produtos
escaneados/buscados normalmente) — com o total combinado somado embaixo.
Isto é desenho de tela, não exige nenhum dado novo: a seleção da mesa já
carrega tudo que precisa (quais `OrderItem`, quanto de cada), e os
produtos da loja já são o carrinho normal do PDV que já estava nos
planos.

## 6. Como será realizado o recebimento único

Reaproveitando a tela de múltiplas formas de pagamento que já existe
para mesas (regra 13 do `CLAUDE.md`, já implementada) — o operador digita
quanto em cada forma (Pix, dinheiro etc.) contra o **total combinado**.
Ao confirmar, numa única transação de banco:

1. Os produtos da loja (se ainda não existirem como `OrderItem`) são
   criados na `ServiceSession` do PDV;
2. Um `Payment` é registrado na `ServiceSession` da **mesa**, com as
   `PaymentItemAllocation` dos itens/frações selecionados;
3. Um (ou mais, se precisar de mais de uma forma de pagamento) `Payment`
   é registrado na `ServiceSession` do **PDV**, cobrindo os produtos da
   loja;
4. Os dois (ou mais) `Payment` ficam marcados como pertencentes à mesma
   operação (ver seção 7).

## 7. Como o sistema distribuirá os valores entre as origens — proposta de schema

Esta é a decisão técnica central. Precisei entender exatamente como
`Payment`/`PaymentItemAllocation` funcionam hoje antes de propor
qualquer coisa (li o código real, não presumi):

- `Payment.serviceSessionId` é **obrigatório e único por pagamento** —
  um `Payment` sempre pertence a exatamente uma sessão. Isto é o motivo
  pelo qual **não dá pra ter um único `Payment` cobrindo mesa e loja ao
  mesmo tempo** sem reescrever essa premissa em todo o sistema
  (cálculo de saldo, relatórios, fechamento — risco alto, reescrita
  grande, exatamente o que o pedido original quer evitar).
- A solução que não exige essa reescrita: **dois `Payment`, um por
  origem** (exatamente como múltiplas formas de pagamento já viram
  múltiplos `Payment` hoje), agrupados por uma referência nova e leve —
  não um "segundo sistema de pagamento", só uma etiqueta de agrupamento
  em cima do que já existe.

**Proposta de schema** (nenhuma tabela financeira existente muda):

```prisma
// Agrupa os Payment de uma operação de recebimento que cobriu mais de
// uma origem (hoje: mesa + PDV) — existe só para gerar um recibo único
// e para a UI saber "estes pagamentos vieram da mesma confirmação".
// Não duplica Payment, não recalcula saldo, não substitui nada: saldo de
// cada ServiceSession continua calculado exatamente como hoje, a partir
// dos Payment normais (voidedAt: null), sem saber nem precisar saber que
// vieram de um checkout combinado.
model CombinedCheckout {
  id             String   @id @default(cuid())
  restaurantId   String
  registeredById String
  idempotencyKey String   @unique
  createdAt      DateTime @default(now()) @db.Timestamptz(6)

  restaurant   Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Restrict)
  registeredBy User       @relation(fields: [registeredById], references: [id], onDelete: Restrict)
  payments     Payment[]

  @@index([restaurantId])
}
```

E em `Payment`, um campo novo, opcional (todo `Payment` de hoje continua
`null` aqui, zero mudança de comportamento):

```prisma
model Payment {
  // ...campos existentes, sem alteração...
  combinedCheckoutId String?
  combinedCheckout   CombinedCheckout? @relation(fields: [combinedCheckoutId], references: [id], onDelete: SetNull)
}
```

**Por que não um campo "valor por origem" dentro de um `Payment` só**:
porque isso exigiria `Payment` saber sobre múltiplas sessões ao mesmo
tempo — a mesma reescrita de premissa que eu quero evitar. Dois
`Payment` simples, cada um 100% dentro das regras que já existem hoje
(saldo, auditoria, estorno, idempotência), é mais seguro e mais barato
de construir.

### Divisão da forma de pagamento entre origens — decidido: manual

**Decisão do usuário (2026-10-15)**: manual — o operador escolhe a forma
de pagamento **separadamente por origem**, não uma divisão automática
"mesa primeiro". No exemplo do pedido, isso significa duas mini-telas de
pagamento (reaproveitando o mesmo componente de múltiplas formas que já
existe hoje): "Mesa 01 — R$ 56,00" recebe sua própria forma (ex.: Pix
R$ 56,00), "Loja — R$ 110,00" recebe a dela (ex.: Pix R$ 44,00 + Dinheiro
R$ 66,00) — sem ambiguidade nenhuma sobre qual forma cobriu o quê. Mais
simples de implementar do que a divisão automática cogitada
originalmente (nenhum algoritmo de distribuição a escrever), e mais
direto de auditar.

## 8. Como serão evitados recebimentos duplicados

- **Idempotência do conjunto**: `CombinedCheckout.idempotencyKey`,
  única, checada primeiro — duplo toque no "Confirmar" devolve a mesma
  operação já criada, nunca cria de novo (mesmo padrão já usado em todo
  o sistema).
- **Atomicidade**: tudo (criar os produtos da loja, registrar os dois
  `Payment`, criar o `CombinedCheckout`) precisa acontecer **numa
  transação só** — se qualquer parte falhar, nada é gravado. Hoje,
  `registerPayment` e `createOrder` abrem cada um a própria transação
  (não dá pra chamar os dois "como estão" e ter atomicidade entre eles).
  **Adaptação necessária**: extrair o núcleo de cada um (a parte que já
  roda dentro de uma transação) para uma função que aceite uma
  transação **já aberta**, em vez de sempre abrir a própria — refatoração
  estrutural, sem mudar nenhum comportamento de quem já chama essas
  funções hoje (mesa sozinha continua funcionando exatamente igual). O
  novo fluxo combinado chama essas duas funções "internas" dentro de uma
  transação Serializable própria seguida de novo tentativa automática em
  conflito (mesmo padrão já usado em `createOrder`/
  `createRoastReservation` para P2002/P2034/P2028).
- **Concorrência nos itens da mesa**: já resolvida de graça — a seleção
  da mesa dentro do PDV usa a mesma `resolveAllocations` que já
  revalida o saldo real do item **dentro da transação**, nunca confiando
  no que a tela carregou antes (regra 24 do `CLAUDE.md`). Se outro caixa
  pagou os mesmos chopes um segundo antes, a transação do combinado
  rejeita com erro claro, igual já acontece hoje numa mesa isolada —
  nenhuma lógica nova de concorrência precisa ser escrita.

## 9. Como a mesa continuará aberta

De graça, sem nenhuma lógica nova: `registerPayment` **nunca** muda o
status da sessão (regra 11/12 do `CLAUDE.md`, ADR 0004) — só reduz o
saldo. O `Payment` da mesa dentro do combinado é, para todo o resto do
sistema, um pagamento igual a qualquer outro — a mesa continua `OPEN`,
as outras pessoas continuam consumindo, pedido novo continua liberado.

## 10. Como serão tratados cancelamentos e estornos

Também de graça, porque cada `Payment` já é independente:
`voidPayment()` (existente, sem mudança) estorna **um** `Payment` por
vez — estornar só a parte da loja (seção 9 do pedido) é só chamar
`voidPayment` no `Payment` que tem aquele `combinedCheckoutId`, sem
tocar no `Payment` da mesa, e vice-versa. "Não deve alterar pagamentos
realizados por outras pessoas da mesa" também é automático — o
combinado só cria/estorna os `Payment` dele, nunca mexe nos existentes.

**Limite que preciso deixar explícito**: estornar o `Payment` da loja
devolve o saldo em aberto (o sistema volta a "dever" aquele valor), mas
**não** é uma devolução física de produto (repor estoque, por exemplo)
— isso é um conceito diferente, que o sistema não tem hoje em lugar
nenhum (nem fora do PDV). Proponho deixar fora do escopo desta feature,
registrado como necessidade futura separada.

## 11. Como funcionará o histórico

- **Financeiro**: o recebimento total (R$ 166,00) nunca é contado duas
  vezes, porque ele nunca existiu como um valor só — sempre foram dois
  `Payment` (R$ 56 + R$ 110) que, somados, batem. Um relatório de "total
  recebido no dia" soma `Payment.amount` como já faz hoje, sem mudança.
- **Vendas por origem**: os relatórios já existentes (Módulo 11) agregam
  por `ServiceSession`/`OrderItem` — a picanha aparece como receita de
  origem PDV, os chopes como receita de origem Mesa, automaticamente,
  porque `ServiceSession.type` já diferencia isso.
- **Consulta da operação combinada em si**: pelo `CombinedCheckout`,
  listando os `Payment` filhos — útil pra reimprimir o recibo ou
  investigar uma reclamação.

## 12. Adaptações necessárias no PDV (ainda não construído)

- Tela de carrinho precisa saber renderizar dois grupos de linha (mesa +
  loja), não só uma lista plana de produtos;
- Ação "+ Adicionar consumo de mesa", reaproveitando o componente de
  seleção já existente da tela de pagamento da mesa;
- O fechamento do PDV (que eu ainda não tinha desenhado em detalhe — só
  decidido que existe) precisa, desde já, ser pensado como "pode ter 1
  ou 2 origens", não só "produtos da loja". Isso **evita retrabalho**
  exatamente como o pedido original antecipou (seção 12) — bom ter
  chegado agora, antes de eu construir a tela assumindo só uma origem.

## 13. Adaptações necessárias no módulo de Mesas

- **Nenhuma mudança de regra de negócio** — só a extração estrutural já
  descrita na seção 8 (`registerPayment`/`createOrder` passam a aceitar
  uma transação externa opcional, mantendo exatamente o comportamento
  atual quando chamadas como sempre foram);
- A tela de pagamento da própria mesa (`/mesas/[id]/pagamentos/novo`)
  continua existindo e funcionando sozinha, sem depender do PDV — o
  componente de seleção só passa a ser **reaproveitado de dois lugares**
  em vez de um.

## 14. Principais riscos técnicos e operacionais

- **Maior risco técnico**: a extração de `registerPayment`/`createOrder`
  para aceitar transação externa precisa ser feita com cuidado pra não
  alterar nenhum comportamento dos fluxos que já funcionam hoje em
  produção (mesa isolada). Mitigação: refatoração pura (sem mudança de
  lógica), suíte de testes completa (unitários + integração) rodando
  limpa antes e depois, exatamente como já é praxe neste projeto.
- **Divisão de forma de pagamento entre origens**: risco de parecer
  arbitrário se não for bem explicado no recibo — mitigado deixando a
  regra determinística e visível (seção 7).
- **Fechamento automático do PDV**: se eu decidir que a sessão do PDV
  fecha sozinha ao atingir saldo zero (sem "solicitar fechamento"), isso
  precisa acontecer de forma consistente mesmo quando o pagamento é
  combinado — ponto a decidir (seção 16).
- **Devolução física de produto**: fora de escopo, mas vale deixar
  registrado pra não reaparecer como surpresa depois (seção 10).
- **RLS**: `CombinedCheckout` é tabela nova — nasce com RLS habilitado
  na própria migration (lição já aprendida neste projeto, não repetir o
  descuido de antes).

## 15. Melhor sequência de implementação

Dentro da Fase 2 (PDV) já em andamento, o Pagamento Combinado se encaixa
como parte do **Passo 3 (fechamento rápido)** do plano já registrado no
backlog, não como uma fase à parte:

1. Refatoração estrutural de `registerPayment`/`createOrder` (transação
   externa opcional) — sozinha, com toda a suíte de testes confirmando
   zero mudança de comportamento, **antes** de qualquer coisa nova;
2. Schema: `CombinedCheckout` + `Payment.combinedCheckoutId`;
3. Orquestrador novo (`registerCombinedCheckout`), reaproveitando os
   núcleos extraídos no passo 1;
4. Tela: ação "+ Adicionar consumo de mesa" dentro do PDV, reaproveitando
   o componente de seleção já existente;
5. Carrinho combinado (mesa + loja) e tela de recebimento (reaproveitando
   a de múltiplas formas já existente);
6. Recibo (extensão do tipo de `PrintJob` já decidido para o PDV, seção
   16 da visão, incluindo o bloco de consumo de mesa quando aplicável);
7. Testes (unitários do orquestrador + integração cobrindo o exemplo
   completo da seção 16, concorrência, estorno parcial);
8. Validação com o usuário contra uma operação real antes de considerar
   concluído.

---

## Exemplo completo (do pedido original)

**Estado inicial**: Mesa 01 aberta, 4 pessoas, consumo total incluindo 3
de 10 chopes Pilsen (R$ 12,00 cada = R$ 36,00 em aberto) e uma porção
dividida em 4 partes, 1 parte ainda aberta (R$ 20,00).

1. Caixa abre o PDV, clica **"+ Adicionar consumo de mesa"**;
2. Vê as mesas com atendimento aberto, seleciona **Mesa 01**;
3. Vê os itens em aberto: Chopp Pilsen (7 de 10 já pagos, 3 em aberto),
   Porção (1/4 em aberto);
4. Seleciona 3 unidades de Chopp Pilsen (R$ 36,00) + a fração de 1/4 da
   Porção (R$ 20,00) → soma R$ 56,00. Confirma a seleção (ainda
   rascunho);
5. Volta ao PDV — carrinho mostra **"Mesa 01 — R$ 56,00"**;
6. Passa a picanha no leitor de código de barras → carrinho mostra
   também **"Loja — R$ 110,00"**;
7. Total combinado: **R$ 166,00**;
8. Clica **Receber** → tela mostra as duas origens separadas, cada uma
   com sua própria forma de pagamento (decisão: manual, seção 7): "Mesa
   01 — R$ 56,00" → Pix R$ 56,00; "Loja — R$ 110,00" → Pix R$ 44,00 +
   Dinheiro R$ 66,00 (o operador digitou assim, sem divisão automática);
9. Confirma. Numa transação só:
   - `OrderItem` da picanha criado na sessão do PDV;
   - `Payment` de R$ 56,00 (Pix) na Mesa 01, com `PaymentItemAllocation`
     dos 3 chopes + 1/4 da porção;
   - `Payment` de R$ 44,00 (Pix) + `Payment` de R$ 66,00 (Dinheiro) na
     sessão do PDV, FULL da picanha (R$ 110,00) — exatamente como o
     operador escolheu, sem nenhuma regra automática por trás;
   - Os três `Payment` recebem o mesmo `combinedCheckoutId`;
   - Sessão do PDV finalizada sozinha (saldo zero — decisão confirmada);
   - Mesa 01 continua `OPEN`, saldo reduzido em R$ 56,00 (o que faltava
     antes, menos o que acabou de ser pago pelas outras 3 pessoas);
10. Recibo impresso: "Mesa 01: 3x Chopp Pilsen + 1/4 Porção — R$ 56,00
    (Pix) / Loja: 1x Picanha — R$ 110,00 (Pix R$ 44,00 + Dinheiro
    R$ 66,00) / Total: R$ 166,00";
11. Relatório de vendas por produto já separa, sem configuração extra:
    receita de Chopp Pilsen/Porção como origem Mesa, receita de Picanha
    como origem PDV.

---

## Decisões do usuário (2026-10-15)

1. **Divisão de forma de pagamento entre origens** → **Manual**. Operador
   escolhe a forma por origem separadamente (seção 7).
2. **Fechamento do PDV** → **Fecha sozinho** ao atingir saldo zero, sem
   passar por "solicitar fechamento" — vale tanto pro PDV combinado
   quanto pro PDV puro (sem mesa envolvida).
3. **Nome do novo modelo** → Confirmado: `CombinedCheckout`.
4. **Devolução física de produto** → Confirmado fora de escopo (só
   estorno de pagamento), registrado como necessidade futura.

## Implementação — acompanhamento

- ✅ **Passo 1 — extração estrutural** (`registerPaymentInTx`,
  `createOrderInTx`, `closeTableInTx`): as três operações que o
  orquestrador vai compor já têm núcleo parametrizado numa transação
  externa, sem mudar o comportamento dos wrappers públicos existentes.
  Confirmado sem regressão: 231 testes unitários e as 88 de integração.
- ✅ **Passo 2 — schema** (`CombinedCheckout` + `Payment.combinedCheckoutId`,
  `prisma/migrations/20261015140000_combined_checkout`): aditivo, RLS
  habilitado na própria migration. `tsc --noEmit`, lint, build, 231
  testes unitários e 88 de integração limpos.
- ✅ **Passo 3 — orquestrador** (`registerCombinedCheckout`,
  `src/application/service-session/register-combined-checkout.ts`):
  compõe `createOrderInTx`/`requestClosingInTx`/`registerPaymentInTx`/
  `closeTableInTx` numa única transação Serializable com retry. Mesa
  sempre paga por `allocations`, loja sempre por `amount` (regra pura em
  `src/domain/service-session/combined-checkout.ts`). PDV nasce `OPEN`,
  passa a `CLOSING` e fecha sozinho ao zerar o saldo — nunca exposto como
  etapa separada ao operador. `registerPaymentInTx` ganhou um parâmetro
  opcional `combinedCheckoutId` (só o orquestrador usa; comportamento de
  quem chama `registerPayment` isoladamente não muda). 2 testes unitários
  (validação pura) + 2 de integração cobrindo o exemplo completo da seção
  16 (mesa + picanha, pagamento manual por origem, idempotência do
  conjunto, estorno independente por origem). `tsc --noEmit`, lint, build,
  233 testes unitários e 90 de integração (12 arquivos) limpos.
- ✅ **Passos 4-5 — tela e carrinho combinado**
  (`src/app/(staff)/pdv/table-consumption-picker.tsx`,
  `pdv-sale-screen.tsx`): "+ Adicionar consumo de mesa" reaproveita tal e
  qual o componente de seleção da mesa (`UnitsLineCard`/`SingleLineCard`/
  `AmountActions`, extraído para
  `mesas/[id]/pagamentos/item-selection-list.tsx` — refatoração mecânica,
  zero mudança de comportamento, verificada no navegador). Carrinho do
  PDV mostra "Mesa X" ao lado dos produtos de loja; Receber ganha duas
  seções (forma de pagamento da mesa — uma só, decisão de manter simples
  nesta fase — e formas da loja, que continuam aceitando split). Venda
  combinada real testada no navegador e conferida no banco:
  `CombinedCheckout` com dois `Payment`, mesa permanece `OPEN` com saldo
  reduzido, sessão do PDV fecha sozinha.
- 🔜 Passo 6 — recibo (extensão do `PrintJob` do PDV, discriminando as
  duas origens).
- 🔜 Passos 7-8 — testes de integração cobrindo o fluxo combinado a
  partir da UI e validação com o usuário contra uma operação real — ver
  seção 15.
