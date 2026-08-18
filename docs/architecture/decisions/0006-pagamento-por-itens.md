# ADR 0006 — Pagamento por Itens e Rateio de Consumo

- **Status**: Aceita
- **Data**: 2026-08-15
- **Relacionada**: ADR 0004 (separação pagamento/fechamento), business-rules.md §6

## Contexto

Pedido do usuário: o caixa hoje só registra um valor solto contra a
comanda (`Payment.amount`, opcionalmente vinculado a uma pessoa via
`guestId`). Não existe nenhuma relação entre um pagamento e os itens de
fato lançados. Na operação real, uma pessoa que vai embora antes das
demais quer pagar exatamente o que consumiu: algumas unidades de um
produto lançado com quantidade (ex.: 3 dos 10 chopes), uma fração de um
prato compartilhado (ex.: 1/4 de uma porção), ou uma combinação das duas
coisas — e o sistema precisa saber depois exatamente o que já foi
quitado e o que continua em aberto, item a item.

"Item pago ou não pago" não é suficiente: um item pode estar totalmente
em aberto, parcialmente pago (unidades ou fração) ou totalmente pago.

## Decisão

Camada aditiva, em paralelo ao motor financeiro existente — o cálculo de
`subtotalAmount`/`paidAmount`/`balanceAmount` em `recalculateSessionTotals`
**não muda em nada**: ele continua somando todo `OrderItem` não cancelado e
todo `Payment` não estornado, exatamente como antes. Pagamento por itens é
só uma camada de rastreamento auxiliar por cima, respondendo "o que este
pagamento cobriu", nunca substituindo a fonte de verdade do saldo.

### Schema

- **`AllocationKind`** (`UNITS` | `AMOUNT`): tipo de fatia. `UNITS` cobre
  unidades inteiras de um item com `quantity > 1` (os 3 dos 10 chopes).
  `AMOUNT` cobre pagar um item inteiro, uma fração de item dividido ou um
  valor personalizado — as três reduzem a "um valor em R$ contra o item",
  só variando se carregam metadado de fração.
- **`PaymentItemAllocation`**: liga um `Payment` a uma fatia de um
  `OrderItem` (`kind`, `quantity` só para `UNITS`, `shareNumerator`/
  `shareDenominator` só quando a fatia veio de um item dividido, `amount`
  sempre presente e sempre a fonte de verdade monetária da fatia). Nunca
  apagada nem tem campo de estorno próprio — como ela pertence a um
  `Payment`, e todo cálculo de "quanto já foi pago" filtra por
  `payment.voidedAt: null`, estornar o pagamento pai já devolve a fatia de
  graça, sem precisar duplicar o mecanismo de anulação aqui.
- **`OrderItem.openShareParts`** (nullable): em quantas partes o **saldo
  aberto atual** de um item compartilhado está dividido agora. Mutável
  livremente a qualquer momento ("Dividir item" / "Redistribuir") — só
  isso precisa persistir para o próximo pagamento continuar de onde o
  anterior parou; o que já foi pago fica congelado dentro da alocação
  (`shareNumerator`/`shareDenominator` são um snapshot do denominador
  vigente no momento daquele pagamento específico, nunca recalculado
  depois).

### Por que não "partes" como linhas fixas (Parte 1, Parte 2, Parte 3...)

Rejeitado de propósito. O requisito real (confirmado com o usuário) é:
antes de qualquer pagamento daquele rateio, a divisão pode mudar
livremente; depois que uma fatia foi paga, o valor pago nunca é
recalculado, só o que ainda está em aberto pode ser redividido. Guardar
"partes" como entidades persistentes com identidade full-time exigiria
decidir o que acontece com "Parte 2" quando o denominador muda de 4 para
3 — pergunta sem resposta de negócio boa. Tratar o saldo aberto como um
valor contínuo (Decimal) redivisível a qualquer momento, com o histórico
do que já foi pago vivendo dentro da própria alocação (imutável), resolve
isso sem ambiguidade: `openAmount / openShareParts` é sempre recalculado
na hora, nunca armazenado como verdade permanente.

### Taxa de serviço e desconto ficam fora do rateio por item

Decisão confirmada com o usuário 2026-08-15: como a MITIZ não cobra taxa
de serviço hoje e o desconto não incide sobre a consumação item a item, a
seleção de itens na tela de pagamento representa direto o valor de
consumo a receber, sem tentar embutir uma fatia proporcional de taxa ou
desconto. Se um dia isso mudar, é uma decisão de negócio nova a ser
tomada explicitamente, não uma distribuição automática assumida por
engenharia.

### "Dividir" é uma propriedade do grupo, não de um item isolado (revisado 2026-08-16)

Pedido do usuário: mesmo um item lançado com mais de uma unidade (ex.: 3
lanches) ou repetido em pedidos diferentes (ex.: 2 porções de linguiça,
uma por pedido) precisa oferecer as duas formas de pagamento ao mesmo
tempo — selecionar quantas unidades pagar, **e** dividir o saldo somado
em N partes (quantidade de pessoas). A restrição original ("só item com
quantity = 1") saiu: "Dividir"/"Redistribuir" agora está sempre
disponível em qualquer linha da seleção, e reparte o saldo aberto do
**grupo inteiro** (soma de todas as linhas de origem daquele produto +
ponto + adicionais + pessoa, mesmo vindas de pedidos diferentes) em N
partes, não o saldo de uma única linha.

Mecânica: `setOrderItemShareParts` (aplicação) recebe uma lista de
`orderItemIds` e grava o mesmo `openShareParts` em todas de uma vez, na
mesma transação — é o saldo somado entre elas que fica dividido. Uma
fração pedida (ex.: "3 partes") pode consumir mais de uma linha de
origem se passar do saldo da mais antiga: `distributeAmountFifo` (novo,
mesmo racional de `distributeUnitsFifo` mas por valor em R$ em vez de
unidades) resolve isso dentro da transação de `registerPayment`, sempre
contra o estado fresco do banco.

Exemplo do pedido do usuário: 2 porções de linguiça (R$120 cada, R$240 no
total) lançadas em pedidos diferentes, "Dividir" em 4 partes de R$60. Um
pagamento de "3 partes" (R$180) tira os R$120 inteiros da porção mais
antiga e os R$60 restantes da outra — vira 2 `PaymentItemAllocation`,
uma por linha real, ambas guardando o mesmo snapshot `shareNumerator=3,
shareDenominator=4`.

Continua valendo: pagamentos já registrados guardam seu próprio snapshot,
nunca são recalculados quando o grupo é redividido depois; item já
dividido mantém isso ao ganhar um novo irmão igual (a divisão vigente é
lida da linha mais antiga do grupo que tiver `openShareParts` gravado).

### Agrupamento na tela de seleção

Revisado em 2026-08-15 (correção de bug relatado pelo usuário: um chope
lançado agora e outro chope do mesmo produto lançado num pedido separado
uma hora depois não estavam juntando na seleção) e 2026-08-16 (painel de
situação da tela de pagamentos tinha o mesmo bug, critério unificado numa
função só, `groupItemsByLine`, usada pelas duas telas). Regra atual:
linhas do mesmo produto + ponto + adicionais + pessoa sempre se juntam
num grupo só, não importa a quantidade de cada linha de origem, se vieram
de pedidos diferentes, nem se alguma já está dividida (chopes lançados em
dois pedidos viram uma seleção só de "10 chopes"; uma porção já dividida
continua agrupada com uma porção igual ainda fechada). O grupo com
exatamente 1 unidade e nenhum outro igual continua sendo o item único de
sempre (pagar inteiro/dividir/valor personalizado). Qualquer outro grupo
vira uma linha "unidades" (stepper para selecionar quantas pagar,
consumidas mais antiga primeiro via `distributeUnitsFifo`), que agora
TAMBÉM oferece "Dividir"/"Redistribuir" ao lado do stepper — as duas
formas de pagar convivem na mesma linha, o operador escolhe qual usar
conforme o caso (unidades pro chope, dividir pra porção compartilhada).

### Duas etapas, sem persistir rascunho

"Selecionar consumo" (etapa 1) é só estado local do cliente (React) até o
pagamento ser de fato confirmado — nenhuma tabela de "carrinho de
pagamento" foi criada. Se o operador cancelar antes de confirmar, nada no
banco muda. A lista de alocações pedidas vai como JSON num campo
escondido do formulário de confirmação (etapa 2, que reaproveita
`paymentMethodId`/`guestId` do fluxo já existente) e é sempre revalidada
contra o banco dentro da transação de `registerPayment` — nunca confiada
como valor final (CLAUDE.md regra 24): quantidade de unidades, saldo de
item dividido e valor personalizado são todos recalculados a partir do
estado fresco antes de gravar qualquer coisa.

### Pagamento livre continua existindo

O formulário antigo (`RegisterPaymentForm`, valor + forma + pessoa, sem
detalhar itens) não foi removido — fica disponível como uma opção
secundária ("Pagamento sem detalhar itens", recolhida) para quando o
caixa só quer abater um valor do saldo sem se importar com qual item
cobre (ex.: uma taxa de serviço futura, um adiantamento). Esse tipo de
pagamento não grava nenhuma `PaymentItemAllocation` e não aparece na
quebra por item — comportamento idêntico ao que já existia.

## Consequências

- Nenhuma mudança em `recalculateSessionTotals`, `Discount`,
  `ServiceCharge` ou nas regras de fechamento (ADR 0004) — evolução
  puramente aditiva.
- `voidPayment` não precisou de nenhuma alteração de lógica: o filtro por
  `payment.voidedAt: null`, já usado em todo cálculo de "quanto foi
  pago", devolve a fatia de graça quando o pagamento pai é estornado.
- Tela de pagamentos ganha um bloco "Itens" (lançado/pago/aberto por
  linha, sempre visível) e o histórico de cada pagamento passa a listar
  quais itens ele cobriu, inclusive no diálogo de confirmação do estorno.
- Testes de integração cobrindo unidades parciais, redistribuição sem
  afetar pagamento anterior, combinação de tipos numa mesma cobrança,
  estorno com devolução correta e rejeição de sobre-alocação mesmo
  pulando a validação do cliente (`tests/integration/
  payment-item-allocation.test.ts`).
