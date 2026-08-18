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

### Escopo v1 de "Dividir item": só quantidade 1

"Dividir item" (rateio de item compartilhado) só está disponível para
`OrderItem` lançado com `quantity = 1` — o caso real do pedido original
(uma porção compartilhada). Dividir entre várias porções iguais na mesma
mesa (ex.: 3-4 porções, dividir o total entre todas as pessoas) fica para
uma v2 (`docs/backlog.md`) — decisão confirmada com o usuário: a v1 seguiu
a proposta original sem essa generalização.

### Agrupamento na tela de seleção

Revisado em 2026-08-15 (correção de bug relatado pelo usuário: um chope
lançado agora e outro chope do mesmo produto lançado num pedido separado
uma hora depois não estavam juntando na seleção). Regra atual: linhas do
mesmo produto + ponto + adicionais + pessoa sempre se juntam, não importa
a quantidade de cada linha de origem nem se vieram de pedidos diferentes
(chopes lançados em dois pedidos viram uma seleção só de "10 chopes"),
consumidos mais antiga primeiro (`distributeUnitsFifo`, determinístico,
calculado dentro da transação contra o estado real do banco). O grupo só
vira uma linha "unidades" (com stepper) quando a soma é maior que 1;
exatamente 1 unidade sozinha continua sendo o item único de sempre
(pagar inteiro/dividir/valor personalizado).

Item já dividido ("Dividir item") nunca entra num grupo, mesmo que exista
outro igual ainda fechado — carrega uma fração própria, incompatível com
o agrupamento por unidade. Efeito colateral aceito conscientemente: duas
porções idênticas, nenhuma ainda dividida, agora também se agrupam numa
linha "2 lançados" (dá pra pagar uma inteira de cada vez; a última que
sobrar sozinha volta a oferecer "Dividir item" normalmente) — dividir uma
delas enquanto as duas ainda estão inteiras e abertas continua fora do
escopo da v1 (mesmo backlog v2 já registrado abaixo).

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
