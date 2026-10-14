# Visão — MITIZ Gestão

- **Status**: **Aprovada (2026-10-15)**. Plano e ordem de fases confirmados
  pelo usuário. Fase 1 (cadastro de produtos) considerada concluída — os
  8 códigos de barras duplicados (seção 3) ficam para correção manual do
  usuário, sem bloquear nada. Fase 2 (PDV) é a próxima; aguardando as
  decisões da seção 16 antes de qualquer código novo.
- **Data**: 2026-10-15
- **Pedido original**: planejamento de evolução do MITIZ Mesas para um sistema de
  gestão completo (nome futuro possível: "MITIZ Gestão"), reduzindo
  progressivamente a dependência do VHSYS.
- **Relacionado**: `CLAUDE.md` (fonte de verdade do projeto),
  [vision.md](vision.md), [mvp-scope.md](mvp-scope.md),
  [business-rules.md](business-rules.md),
  [../architecture/overview.md](../architecture/overview.md), todas as 9 ADRs
  em `docs/architecture/decisions/`.

---

## 1. Minha compreensão da visão geral

O MITIZ Mesas nasceu como sistema operacional de salão (mesas, comandas,
pedidos, produção, pagamento) **coexistindo** com o VHSYS, que hoje faz o
papel de PDV e gestão. O pedido agora é expandir esse mesmo aplicativo —
não criar um sistema paralelo — até ele cobrir PDV, caixa, financeiro,
fiscal e bancário, com o VHSYS saindo de cena **módulo a módulo**, só
depois de cada parte nova estar validada contra o fluxo real da operação.

Três princípios do pedido original que considero inegociáveis e que já
orientam este documento inteiro:

1. **Cadastro único de produtos**, compartilhado entre mesas, retiradas,
   reservas de assado e o futuro PDV — já é o caminho que o projeto está
   seguindo (ADR 0009).
2. **Histórico central de vendas**, sem duplicar venda por causa de
   pagamento parcial em várias formas — isto **já existe hoje** para
   mesas (ver seção 5); o trabalho do PDV é se encaixar no mesmo
   mecanismo, não inventar um novo.
3. **Evolução por fases pequenas**, nunca duas frentes grandes ao mesmo
   tempo, preservando o que já funciona na operação real da loja.

## 2. Inventário dos módulos existentes — estado real

Conferido no código e no `docs/backlog.md`, não presumido:

| Módulo | Status real | Observação |
|---|---|---|
| 0 — Fundação | ✅ Completo | Next.js 15, Prisma, Supabase, stack confirmada (ADR 0001/0002) |
| 1 — Autenticação e permissões | ✅ Completo | Supabase Auth, 4 perfis (Admin/Caixa/Garçom/Produção), RBAC no backend |
| 2 — Cadastros básicos | ✅ Completo | Setores, categorias, mesas, produtos, modificadores |
| 3 — Mesas e atendimentos | ✅ Completo | `ServiceSession`, um atendimento ativo por mesa |
| 4 — Pedidos | ✅ Completo | Rascunho, envio, separação por setor, cancelamento com auditoria |
| Repaginação visual | ✅ Completo | Fora da numeração de módulos, design system aplicado |
| 5 — Tempo real | ✅ Completo | Supabase Realtime broadcast, por canal (mesa/setor) |
| 6 — Produção | ✅ Completo | Fila por setor, estados do item |
| 7 — Impressão | ✅ Completo, **validado com hardware real** | Epson TM-T20 física, agente local, fila `PrintJob` com 5 tipos hoje |
| 8 — Caixa e pagamentos | ✅ Completo **na prática** | Ver nota abaixo — cabeçalho do backlog não tem ✅, mas o fluxo inteiro está implementado e em uso (ADR 0004 separação pagamento/fechamento, ADR 0006 pagamento por item) |
| 9 — Cancelamentos e auditoria | ✅ Completo | `AuditLog` genérico, usado por todos os módulos seguintes |
| 10 — Histórico | ✅ Completo | Por mesa e por retirada |
| 11 — Relatórios básicos | ✅ Completo | 4 relatórios (vendas por período/produto, tempo de mesa, horários de pico) |
| 12 — Integração futura com PDV | 🔶 **Parcial** | Fase 1 (vínculo manual `Product.vhsysProductId` ↔ VHSYS) implementada; Fase 2 (criar venda balcão automaticamente ao fechar) **não implementada**, aguardando pedido explícito (ADR 0007) |
| 14 — Retiradas | ✅ Completo | Mesmo `ServiceSession`, `type = PICKUP` — prova que o modelo já se estende sem reescrita |
| 15 — Pagamento por itens e rateio | ✅ Completo | ADR 0006 |
| 16 — Reservas de Assados | ✅ Completo | Módulo isolado (não vende, só reserva) |
| Cadastro de produtos ampliado | 🔶 **Em andamento, quase concluído** | Ver seção 3 |

**Nota sobre o Módulo 8**: o cabeçalho em `docs/backlog.md` não tem o ✅ que
os demais módulos concluídos têm, mas todo o conteúdo descrito ali
(`Payment`/`PaymentMethod`/`Discount`/`ServiceCharge`, divisão, múltiplas
formas, bloqueio de fechamento com saldo) está implementado e em uso —
confirmei lendo o código das ações de pagamento e o ADR 0004. Parece uma
inconsistência de registro no documento, não uma lacuna real. Não corrigi
o arquivo agora (pedido explícito de não alterar nada), só deixo
registrado aqui.

**Gap de documentação**: `docs/testing/strategy.md`, citado no `CLAUDE.md`
§19 e no `mvp-scope.md` como documento a manter, **nunca foi criado**. A
cultura de testes do projeto é forte na prática (todo módulo novo traz
testes unitários e de integração, sempre relatados) — só falta consolidar
isso num documento central. Não bloqueante, mas vale fechar em algum
momento.

## 3. Situação atual do cadastro de produtos

Esta etapa está, de fato, quase concluída (ADR 0009):

- **Fase 1 (schema)**: ✅ concluída. `Product` ganhou ~20 campos (código,
  código de barras, marca, unidade, custo, estoque, NCM, CEST, origem,
  ICMS/IPI/PIS/COFINS, fornecedor). `Category.externalCode` e
  `Category.visibleInOrders` também prontos.
- **Fase 2 (tela)**: ✅ concluída. Formulário em seções, busca por
  nome/código/código de barras.
- **Importação do catálogo real da VHSYS**: ✅ executada. 432 produtos no
  total (53 que já eram vendidos nas mesas + 379 novos, só de catálogo,
  categoria/setor "Loja", `available: false` até o PDV existir).
- **Pendência conhecida, deixada como está por decisão do usuário**: 8
  produtos da planilha original da VHSYS têm código de barras duplicado
  entre si (confirmado direto no XML do arquivo, não é notação científica
  do Excel). Usuário confirmou (2026-10-15): o mesmo produto foi mesmo
  lançado duplicado na VHSYS — vai corrigir manualmente depois, sem
  urgência. **Fase 1 considerada concluída** mesmo assim.
- **Dependência já identificada e registrada no backlog**: `OrderItem.quantity`
  é inteiro hoje — venda por peso (carnes no PDV) vai exigir essa mudança.
  Ver seção 12 (dependências) e seção 16 (decisão a tomar).

Este cadastro já é, hoje, o único cadastro de produto do sistema — mesas,
retiradas e reservas de assado todas leem o mesmo `Product`. A base pedida
na seção 3 do pedido original **já está pronta** para o PDV consumir.

## 4. O projeto atual suporta esta expansão?

Sim, e de forma incomum — o motor financeiro e de vendas necessário pro
PDV **já existe**, construído para mesas e já reaproveitado uma vez para
retiradas sem reescrita. Ver detalhe na próxima seção.

Onde o projeto **não** tem nada ainda, e vai precisar de desenho novo:

- Caixa físico (abertura/fechamento, sangria, suprimento, conferência);
- Fornecedor como cadastro próprio (hoje é só texto em `Product`);
- Contas a pagar/receber;
- Qualquer coisa fiscal (emissão, não só os campos de referência);
- Qualquer coisa bancária;
- Tela de PDV em si (busca rápida, carrinho, leitura de código de barras);
- Cadastro de formas de pagamento pela UI (hoje só existe via seed —
  listado no `CLAUDE.md` §10 como cadastro admin, mas a tela nunca foi
  construída).

## 5. Pontos de arquitetura já reutilizáveis — o achado mais importante desta análise

O `ServiceSession` já é, na prática, uma abstração de **"atendimento que
gera venda"**, não "mesa". A prova está no próprio histórico do projeto:
quando o módulo Retiradas foi pedido (2026-08-14), ninguém criou uma
tabela nova de "pedido avulso" — `ServiceSession` ganhou um segundo valor
de `type` (`PICKUP` ao lado de `TABLE`), `tableId` virou opcional, e todo
o resto (`Order`, `OrderItem`, `Payment`, `Discount`, `ServiceCharge`,
impressão, relatórios) continuou funcionando sem mudança nenhuma de
lógica (ADR 0005).

**Isto significa que o PDV não precisa de um `Sale`/`SaleItem` novo.**
Minha recomendação central: PDV é um **terceiro valor de
`ServiceSessionType`** (nome a decidir — seção 16), do mesmo jeito que
`PICKUP` foi o segundo.

O que isso resolve de graça, já reaproveitando o que existe:

| Necessidade do pedido original (seção 5) | Já resolvido por |
|---|---|
| Histórico central de vendas, qualquer origem | `ServiceSession` (basta um 3º `type`) |
| Separar venda de pagamento | Já é assim desde a revisão 2026-08-10 (ADR 0004) — pagamento nunca fecha a venda sozinho |
| Múltiplas formas de pagamento por venda | `Payment` já aceita N por `ServiceSession`, cada um com sua `PaymentMethod` |
| Não duplicar venda por pagamento parcial | Já é a regra 11/12 do `CLAUDE.md` — saldo = total − pago, uma sessão fechada = uma venda |
| Registrar quem fez cada operação | `registeredById`/`appliedById`/`voidedById` já existem em `Payment`/`Discount`/`ServiceCharge` |
| Cancelamento e estorno registrados | Já é o padrão (`voidedAt`/`voidReason`, nunca `DELETE`) |
| Rastreabilidade da origem da venda | `ServiceSession.type` já é exatamente isso |

Outros pontos reutilizáveis, por módulo:

- **Produtos**: cadastro único já pronto (seção 3) — inclusive `sku`/
  `barcode` já existem no schema, então "ler código de barras no PDV" é
  só uma busca por campo já existente, zero schema novo.
- **Impressão**: `PrintJob` já suporta 5 tipos de conteúdo coexistindo
  (`NEW_ORDER`, `COMPLEMENT`, `CANCELLATION`, `REPRINT`, `BILL_SUMMARY`,
  `ROAST_RESERVATION`) — um recibo de PDV é só um 6º tipo, reaproveitando
  agente, fila, autenticação por token e reprocessamento que já existem.
- **Permissões**: `Role`/`Permission`/`RolePermission` já são genéricos —
  novos códigos (`pdv.sell`, `cash.manage` etc.) encaixam no padrão
  existente sem infraestrutura nova (atende diretamente o pedido da
  seção 10 do usuário: "não criar outro sistema de permissões").
- **Auditoria**: `AuditLog` já é genérico (`action`/`entityType`/
  `entityId`/`metadata`) — toda ação financeira nova cai no mesmo
  mecanismo.
- **Tempo real**: padrão de canal por entidade (`table:{id}`,
  `sector:{id}`) generaliza para `cashSession:{id}` se um caixa precisar
  de atualização ao vivo entre dois caixas abertos.
- **Relatórios**: o motor de agregação (Módulo 11) já lê `ServiceSession`/
  `OrderItem` direto — incluir vendas PDV nos relatórios existentes é
  estender o filtro, não reescrever.
- **Segurança**: RLS deny-by-default em toda tabela nova já é hábito do
  projeto (inclusive depois de um descuido real, corrigido — ver seção
  15).

## 6. Riscos de duplicidade de dados ou funcionalidades

- **O maior risco de toda esta expansão**: tratar o PDV como sistema
  separado (criar `Sale`/`SaleItem` próprios) duplicaria o motor
  financeiro inteiro que já existe e já funciona, e quebraria exatamente
  o requisito de histórico central que o pedido original pede na seção
  5. Meu voto é claramente contra isso — ver seção 5 acima.
- **Fornecedor**: `Product.supplierName`/`supplierCode` já existem como
  texto simples (decisão deliberada da ADR 0009, prevendo isto). Quando o
  financeiro (Fase 4) chegar, a entidade `Supplier` própria deve ser
  promovida a partir desses campos, nunca criada como um segundo cadastro
  de fornecedor paralelo.
- **Forma de pagamento**: `PaymentMethod` já existe para recebimentos.
  Contas a pagar vai precisar de "forma de pagamento usada para pagar o
  fornecedor" — decidir explicitamente na Fase 4 se reaproveita a mesma
  tabela ou cria uma irmã clara (os dois sentidos são logicamente
  diferentes), mas isso é uma decisão a tomar, não algo pra duplicar sem
  pensar.
- **Relatórios por origem**: qualquer relatório novo precisa filtrar por
  `restaurantId` direto na `ServiceSession`, nunca via `table: {...}` —
  já houve um bug real nisso quando Retiradas foi criado (correção
  2026-08-20, relatado pelo usuário) porque retirada não tem mesa. PDV
  vai ter o mesmo risco se esse detalhe for esquecido de novo.
- **Dados fiscais**: `Product` já carrega NCM/CEST/origem/alíquotas (ADR
  0009) — não recriar campo fiscal em outro lugar quando a Fase 5
  chegar.
- **Autenticação/permissões**: não criar um sistema de login ou RBAC
  separado para o PDV (pedido explícito do usuário, seção 10) —
  `User`/`Role`/`Permission` já bastam, só com códigos novos.

## 7. Proposta de estrutura de módulos e menus

Hoje: sidebar admin tem Mesas, Retiradas, Reservas de Assados, Setores,
Categorias, Produtos, Impressoras, Usuários, Relatórios, Integrações. A
barra inferior do app de salão tem Mesas, Reservas, Produção, Impressão,
Histórico, Admin, Conta.

Proposta incremental — um item por fase concluída, nunca tudo de uma vez:

- **Fase 2 (PDV)**: novo item na barra inferior do app de salão (visível
  só pra quem tem a permissão nova de venda), tela própria de venda
  rápida — layout mais parecido com um carrinho de PDV de verdade do que
  com o fluxo de "novo pedido" de mesa, mesmo reaproveitando o motor por
  baixo.
- **Fase 3 (Caixa)**: "Caixa" — como o perfil Caixa já existe, pode viver
  tanto no app de salão quanto num espaço próprio; decisão de UX, não de
  arquitetura.
- **Fase 4 (Financeiro)**: nova seção "Financeiro" na sidebar admin,
  visível só com um código de permissão novo (`finance.view`/
  `finance.manage` — não misturar com `ADMIN_MANAGE` geral, dinheiro
  merece controle próprio), com sub-telas Contas a pagar / Contas a
  receber / Painel.
- **Fase 5 (Fiscal)**: dentro de Produtos (já tem os dados fiscais) +
  uma tela de emissão/consulta, naturalmente perto de onde a venda PDV
  nasce.
- **Fase 6 (Bancário)**: dentro de "Financeiro", nova aba de consulta
  DDA/conciliação.

## 8. Proposta de fluxo integrado (produtos → PDV → mesas → vendas → caixa)

```
                         ┌────────────────────┐
                         │   Product (único)   │  ← já existe (ADR 0009)
                         └──────────┬──────────┘
                                    │ usado por
          ┌─────────────┬──────────┴──────────┬─────────────┐
          ▼             ▼                     ▼             ▼
      Mesa (TABLE)  Retirada (PICKUP)     PDV (novo type)  Reserva de Assado
          │             │                     │             (não vende — módulo
          └──────┬──────┴──────────┬──────────┘              isolado, ADR 0008)
                 ▼                 ▼
          ServiceSession (já existe, um 3º `type`)
                 │
       ┌─────────┼──────────────────┐
       ▼         ▼                  ▼
   Order/     Payment (N, já     Discount/
   OrderItem  aceita múltiplas   ServiceCharge
   (consumo)  formas)            (quando aplicável)
       │         │
       └────┬────┘
            ▼
   ServiceSession fechada (CLOSED) = UMA venda no histórico central,
   independente de ter sido mesa, retirada ou PDV
            │
            ▼ (Fase 3, novo)
     CashSession do turno — agrupa/concilia os Payment em dinheiro
     daquele período, NUNCA soma de novo o valor (Payment já é a
     fonte única de verdade de "quanto entrou")
            │
            ▼ (Fase 5, novo, futuro)
     FiscalDocument — gerado a partir de uma ServiceSession fechada
     de origem PDV (mesa/retirada não emitem fiscal por padrão, mas o
     desenho não deve impedir isso no futuro, só não implementar agora)
```

O exemplo do pedido original (mesa com R$250, três pagamentos em três
formas diferentes) **já funciona hoje exatamente como descrito**: uma
`ServiceSession`, três `Payment` (Pix/débito/crédito), saldo zero,
`closeTable()` fecha uma única vez — nunca três vendas. Uma venda feita
direto no PDV alimentaria o mesmo histórico, só com `type` diferente.

## 9. Proposta de estrutura para o financeiro (Fase 4)

Novo domínio `finance`, reaproveitando o que já existe sempre que possível:

- `Supplier` — promovido de `Product.supplierName`/`supplierCode`
  (decisão já prevista na ADR 0009) quando esta fase chegar;
- `ExpenseCategory` — categorias de despesa (equivalente financeiro de
  `Category`, mas é uma entidade conceitualmente diferente, não a mesma
  tabela);
- `Expense` (conta a pagar) — fornecedor, categoria, valor, emissão,
  vencimento, parcela/recorrência, desconto, juros/multa, forma de
  pagamento, anexo, situação;
- `ExpensePayment` (baixa) — mesmo padrão do `Payment` já existente:
  nunca apagar, só anular com motivo; permite baixa parcial;
- `Receivable`/`ReceivablePayment` — estrutura simétrica para contas a
  receber;
- `BankAccount` — preparação para a Fase 6, não usado ainda na Fase 4
  além de identificar de qual conta uma despesa foi paga.

Reaproveitado sem mudança: `AuditLog`, `Role`/`Permission` (códigos
novos), formatação BRL e `Decimal` já padronizados em todo o projeto
(regra 20/21 do `CLAUDE.md`), o padrão de nunca apagar registro
financeiro (regra 8).

**Gap a decidir nesta fase**: anexos/comprovantes de despesa precisam de
armazenamento de arquivo — o projeto não usa nenhum storage de arquivo
hoje (nem Supabase Storage, nem outro). Avaliar then, não agora.

## 10. Preparações necessárias para a futura emissão fiscal

**Já pronto** (ADR 0009, Fase 1): `Product.ncm`, `cest`, `origin`,
`icmsRate`, `ipiRate`, `pisRate`, `cofinsRate`, `taxableUnit`,
`fiscalBenefitCode`, `fiscalClassType` — mas, como já documentado na
própria ADR, **nenhum desses campos está validado para uso fiscal real**
ainda (vários produtos têm NCM incompleto, a maioria não tem
ICMS/IPI/PIS/COFINS classificado).

**Faltando, para quando a Fase 5 chegar**:

- Dados do emitente (CNPJ, IE, regime tributário) — hoje não existem em
  lugar nenhum do sistema;
- Armazenamento seguro de certificado digital — superfície de segurança
  nova; o projeto hoje só tem variável de ambiente simples (`.env`), não
  um cofre de segredo; precisa de solução própria quando chegar a hora
  (ex. Supabase Vault ou equivalente);
- Modelo `FiscalDocument` (tipo NFC-e/NF-e, status, chave de acesso,
  protocolo da SEFAZ, XML, DANFE) — nada disso existe ainda;
- Escolha de provedor (API fiscal especializada vs. integração própria
  com a SEFAZ) — decisão explicitamente adiada pelo próprio usuário
  (seção 7 do pedido original), correto não me adiantar nisso;
- Validação com a contabilidade da MITIZ antes de produção — também já
  exigido explicitamente pelo usuário.

## 11. Preparações necessárias para integrações bancárias futuras

**Faltando, para quando a Fase 6 chegar**: modelo de título DDA
(fornecedor, valor, vencimento, identificador único do banco — linha
digitável ou nosso número — para deduplicação), fluxo de conversão
título → `Expense` com checagem de duplicidade, pesquisa de qual API
cada banco realmente expõe pra DDA (o próprio usuário já avisou, com
razão, que Open Finance sozinho não garante acesso a todos os títulos).
Nada disso deve ser implementado agora — só a `Expense` da Fase 4
precisa já nascer pronta para aceitar uma origem "criada a partir de um
título DDA" (um campo de referência simples, sem a integração em si).

## 12. Dependências entre as fases

- **Fase 2 (PDV)** depende de: Fase 1 (cadastro de produtos) — já está
  praticamente pronta. Decisão a tomar **antes** de começar: se venda por
  peso entra na primeira versão (exige `OrderItem.quantity` decimal) ou
  fica pra depois (PDV v1 só por unidade).
- **Fase 3 (Caixa)** depende de: Fase 2 completa (precisa existir venda
  de PDV em dinheiro pra ter o que conciliar).
- **Fase 4 (Financeiro)** é tecnicamente quase independente de 2 e 3
  (contas a pagar não depende de PDV existir), mas faz mais sentido
  depois, porque reaproveita padrões de formulário/auditoria já maduros
  e porque o painel financeiro ideal já quer dado de venda centralizado
  da Fase 3.
- **Fase 5 (Fiscal)** depende de: Fase 2 (precisa de venda PDV pra ter o
  que emitir) e de decisões externas (contabilidade, provedor).
- **Fase 6 (Bancário)** depende de: Fase 4 (conta a pagar precisa existir
  antes de "criar conta a pagar a partir do DDA" fazer sentido) e de
  pesquisa de API por banco.

## 13. Ordem de desenvolvimento recomendada

A ordem que o usuário propôs (Produtos → PDV → Caixa → Financeiro →
Fiscal → Bancário) **bate exatamente** com as dependências técnicas reais
levantadas na seção 12 — não encontrei motivo pra propor uma ordem
diferente. Único ajuste que sugiro: resolver a decisão sobre venda por
peso **antes** de começar a Fase 2 (não durante), porque ela muda o
tamanho do trabalho logo no primeiro passo.

## 14. Plano de evolução em etapas pequenas (detalhado só para a próxima fase — PDV)

Mesmo espírito do que já foi feito no cadastro de produtos (fases
pequenas, validadas uma a uma):

1. Decisão de escopo (peso entra ou não na v1) + nome do novo
   `ServiceSessionType` — só isso, sem código ainda;
2. Schema: o novo `type` no enum existente (migration pequena, mesmo
   padrão de quando `PICKUP` foi criado) + permissões novas;
3. Tela de venda: busca por nome/código/código de barras, carrinho,
   quantidade — reaproveitando `Product.sku`/`barcode` já prontos;
4. Fechamento rápido: forma de pagamento, múltiplas formas, cálculo de
   troco;
5. Recibo: 6º tipo de `PrintJob`, reaproveitando a fila/agente existente;
6. Testes (unitários + integração, mesmo padrão do resto do projeto);
7. Validação com o usuário contra uma venda real de balcão antes de
   considerar a fase concluída.

As fases seguintes (Caixa, Financeiro, Fiscal, Bancário) merecem o mesmo
detalhamento quando chegar a vez delas — não faz sentido planejar o
passo a passo fino de uma fase que só começa depois que a anterior foi
validada.

## 15. Principais riscos técnicos e operacionais

- **`OrderItem.quantity` inteiro**: risco técnico concreto e já
  conhecido (registrado no backlog desde a importação de produtos) —
  decisão de escopo precisa vir cedo, não no meio da Fase 2.
- **Caixa físico (dinheiro)**: domínio sensível a erro humano (diferença
  de caixa, sangria sem registro) — exige desenho cuidadoso e auditoria
  forte desde a primeira versão, não um "v1 simples" que se mostra
  furado depois.
- **Certificado digital / segredo fiscal**: superfície de segurança nova
  quando a Fase 5 chegar — o projeto hoje não tem um cofre de segredo
  adequado para isso.
- **VHSYS em paralelo por tempo indeterminado**: risco real de
  divergência de dado enquanto a migração for gradual — já vivido na
  importação de produtos (preço desatualizado, código de barras
  duplicado). Cada fase precisa de um plano explícito de comparação
  contra o VHSYS antes de considerar desligar o equivalente lá, exatamente
  como o próprio usuário já exige (seção 13 do pedido original).
- **Crescimento do projeto**: risco de perder a disciplina de camada fina
  + domínio puro + teste primeiro que sustentou a qualidade até aqui à
  medida que mais módulos se acumulam — mitigação é continuar por fases
  pequenas, nunca duas frentes grandes ao mesmo tempo (CLAUDE.md §16,
  já seguido rigorosamente até aqui).
- **RLS em tabela nova**: processo já tem um checklist (RLS habilitado na
  própria migration), mas já foi esquecido uma vez de verdade
  (`payment_item_allocations`, corrigido em 2026-10-06) — muitas tabelas
  novas vêm pela frente (`CashSession`, `Expense`, `FiscalDocument`,
  `BankAccount`...), vale reforçar esse hábito a cada nova fase.

## 16. Decisões que precisam da sua aprovação antes de cada fase

**Fase 2 — PDV**:
1. Nome do novo `ServiceSessionType` (ex. "PDV", "COUNTER", "BALCAO")?
2. Venda por peso entra na primeira versão (exige mudar
   `OrderItem.quantity` para decimal, afeta cálculo de subtotal e
   impressão em todo o sistema, não só no PDV) ou fica para depois,
   vendendo só por unidade no início?
3. Troco é só um cálculo de tela (não grava nada novo) ou precisa virar
   um campo gravado no `Payment` (ex. valor recebido vs. valor líquido)?
4. O recibo do PDV reaproveita o layout de ticket atual (mais parecido
   com comanda de cozinha) ou precisa de um formato de "recibo de venda"
   diferente, com todos os itens e totais num formato mais parecido com
   nota?

**Fase 3 — Caixa**:
5. Um caixa por período (ex. diário) ou por turno/usuário — pode haver
   mais de um caixa aberto ao mesmo tempo na MITIZ, ou é sempre um só?
6. Sangria/suprimento exige motivo obrigatório (mesmo padrão de auditoria
   do resto do app)?

**Fase 4 — Financeiro**:
7. `Supplier` vira entidade própria já nesta fase, ou continua como texto
   até haver necessidade mais concreta (ex. relatório de compra por
   fornecedor)?
8. Anexo de comprovante — Supabase Storage (nunca usado no projeto até
   hoje, custo/configuração novos) ou outro provedor?

**Fase 5 — Fiscal**:
9. Qual provedor de API fiscal avaliar (decisão externa, com a
   contabilidade — não tenho preferência técnica a priori)?
10. Regime tributário da empresa confirmado com a contabilidade antes de
    desenhar o cálculo de imposto?

**Fase 6 — Bancário**:
11. Quais bancos a MITIZ usa de fato, para eu pesquisar a API certa de
    cada um?
12. Caminho de Open Finance via qual agregador, se for esse o caminho
    escolhido?

Nenhuma dessas decisões precisa ser tomada agora — só quando a fase
correspondente começar. Listadas aqui para você já saber o que vem pela
frente.

---

## Mapa conceitual (resumo visual)

```
                    ┌───────────────────────────┐
                    │  Produto (cadastro único)  │ ADR 0009 — pronto
                    └──────────────┬─────────────┘
                                   │
        ┌──────────────┬──────────┼──────────────┬──────────────┐
        ▼              ▼          ▼              ▼              ▼
      Mesa          Retirada     PDV          Reserva de     (futuro:
    (existe)        (existe)   (Fase 2)        Assado        outras
                                              (não vende,     origens)
                                               isolado)
        │              │          │
        └──────┬───────┴──────────┘
               ▼
     ServiceSession / Order / OrderItem / Payment / Discount / ServiceCharge
               │                    (motor já existe — reaproveitado, não recriado)
               ▼
     Histórico central de vendas (uma ServiceSession fechada = uma venda)
               │
               ├──────────────► Relatórios (Módulo 11, já existe, estende o filtro)
               │
               ▼ (Fase 3)
         CashSession (abre/fecha turno, concilia Payment em dinheiro)
               │
               ▼ (Fase 4)
     Financeiro: Expense/Receivable ──► Supplier (promovido de Product)
               │                   └──► PaymentMethod (reaproveitado ou irmão)
               ▼ (Fase 5)
     FiscalDocument (a partir de venda PDV fechada) ──► campos fiscais do Product (já prontos)
               ▼ (Fase 6)
     BankAccount / título DDA ──► cria Expense automaticamente
```

---

## Roadmap consolidado

| Fase | Conteúdo | Depende de | Status |
|---|---|---|---|
| 1 | Cadastro de produtos ampliado + importação VHSYS | — | ✅ Concluída (2026-10-15) — 8 códigos de barra duplicados deixados para correção manual do usuário, sem bloquear |
| 2 | PDV (venda rápida, código de barras, formas de pagamento, troco, recibo) | Fase 1 | **Em andamento** — aguardando as decisões da seção 16 |
| 3 | Caixa e vendas centralizadas (abertura/fechamento, movimentações) | Fase 2 | Aguardando |
| 4 | Financeiro (contas a pagar/receber, painel, alertas) | Fases 2-3 recomendado, não estritamente obrigatório | Aguardando |
| 5 | Fiscal (NFC-e, depois NF-e) | Fase 2 + validação externa (contabilidade, provedor) | Aguardando |
| 6 | Integrações bancárias (DDA, conciliação) | Fase 4 + pesquisa de API por banco | Aguardando |

**Próximo passo (2026-10-15)**: plano aprovado pelo usuário. Fase 1
encerrada. Fase 2 (PDV) começa assim que os pontos 1 a 4 da seção 16
forem decididos — nenhum código novo até lá.
