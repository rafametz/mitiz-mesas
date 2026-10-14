# ADR 0009 — Cadastro de produtos ampliado e importação VHSYS

- **Status**: Concluída. Fases 1 (banco de dados) e 2 (tela de produtos)
  implementadas; Fases 3-6 (telas de importador A-F reutilizável)
  substituídas, a pedido do usuário (2026-10-14), por uma importação única
  feita diretamente via script — ver seção 0-B. Catálogo real já
  importado em produção.
- **Data**: 2026-10-14
- **Relacionada**: CLAUDE.md §21 (integração futura com PDV), ADR 0007 (integração
  VHSYS — Vendas Balcão/PDV, Fase 1 já implementada)
- **Arquivo de referência analisado**: `TABAELA DE PRODUTOS.xlsx` (exportação do
  VHSYS fornecida pelo usuário em 2026-10-14), 417 produtos, 30 colunas, lido
  integralmente (não só uma amostra).

## Contexto

Pedido do usuário: evoluir o cadastro de produtos do MITIZ Mesas para comportar os
dados comerciais, de estoque e fiscais que já existem no VHSYS, usando um cadastro
único para mesas/comandas, retiradas e, no futuro, PDV, estoque e emissão fiscal —
e construir um importador administrativo da planilha exportada do VHSYS.

Pedido explícito: **não implementar nada nesta etapa**. Este documento é só a
análise e a proposta, para aprovação antes de qualquer código.

---

## 0. Decisões do usuário (2026-10-14, respostas à seção 16)

Respostas às 8 perguntas da seção 16, nesta ordem:

1. **Nomes das 7 categorias**, confirmados por captura de tela da VHSYS:
   `349824`=Acompanhamento, `349865`=Bebida, `349813`=Carnes,
   `349276`=Churrasqueira, `348481`=Molhos, `349820`=Sal e Temperos,
   `349277`=Utensílios. (`0` continua "sem categoria", 317 produtos.)
2. **Setor padrão por importação, ajustável por produto**: confirmado.
3. **Preço de venda**: **sempre atualiza conforme o valor da planilha**, sem
   perguntar produto a produto (substitui a seção 10 original).
4. **Quantidade fracionária (venda por KG)**: aceito não implementar agora.
   Usuário confirmou que isto **vai ser necessário no futuro PDV**, para venda
   de carnes por peso — registrado como item de backlog
   (`docs/backlog.md`), não perdido.
5. **Biblioteca de Excel**: aprovado adicionar `xlsx` (SheetJS) ou `exceljs`
   como dependência de produção.
6. **"TAXA DE SERVIÇO" + nomes duplicados**: tratamento exatamente como
   proposto, confirmado.
7. **Estratégia de teste**: usuário pediu para eu definir e montar. Decisão:
   **"modo simulação" por rollback de transação** (ver seção 11 revisada) —
   roda a importação inteira (parse, correspondência, criação/atualização,
   validações e constraints reais do banco) dentro de
   `prisma.$transaction`, e a transação é **sempre desfeita** no final do modo
   simulação, nunca commitada. Isto testa contra o banco de verdade (dados
   atuais reais, constraints reais) sem gravar nada, sem precisar de um
   Supabase/Postgres separado só para teste. `ProductImportBatch` fica
   marcado `SIMULATED`, com todas as `ProductImportRow` preenchidas como se
   tivesse rodado de verdade — dá pra conferir linha a linha antes de rodar
   em modo real.
8. **Nome do campo**: `sku` (sem "vhsys" no nome, pedido do usuário). Pela
   mesma lógica, os demais campos novos que originalmente tinham prefixo
   `vhsys` também perdem o prefixo nesta revisão: `vhsysSupplierId` →
   `supplierCode`, `vhsysNotes` → `importNotes`, e o campo novo em
   `Category` vira `externalCode` (era `vhsysCategoryId`). **Só
   `Product.vhsysProductId` continua com esse nome** — é um campo que já
   existe em produção (ADR 0007, Fase 1), usado por outra funcionalidade (o
   `id_produto` da VHSYS para a futura venda balcão), não faz parte desta
   proposta e não foi tocado.

O restante deste documento foi atualizado para refletir essas decisões; onde
o texto original ainda aparecer como pergunta aberta, a resposta acima
prevalece.

## 0-B. Mudança de estratégia e execução (2026-10-14)

Depois da Fase 2 pronta, o usuário decidiu **não construir as telas A-F do
importador reutilizável** (seções 7, 14, 19 originais) — pediu uma
importação única, feita diretamente por mim via script, contra o arquivo
real, com o resultado registrado nas tabelas de auditoria que a Fase 1 já
tinha criado (`ProductImportBatch`/`ProductImportRow`), em vez de uma UI.

Antes de rodar, cruzei a planilha com o catálogo real (53 produtos
usados nas mesas hoje) e apresentei achados concretos para decisão:

- 26 linhas bateram por nome exato com produto já existente (uma delas
  era a "FANTA LARANJA LATA 350ml" duplicada na planilha, com preços
  diferentes — usuário confirmou manter só o código com R$5,00).
- 4 pares de nome parecido, decididos individualmente: 3 são o mesmo
  produto (ligados manualmente, nunca por heurística automática) e 1
  ("COCA-COLA ZERO 1L" vs. "Coca Cola Zero 2L" do MITIZ) **não é o
  mesmo produto** — confirmado como produto novo.
- **Achado de segurança não previsto no pedido original**: a tela de
  novo pedido do garçom lista todo produto com `available=true` sem
  filtrar por setor — importar os produtos novos com o padrão do schema
  teria feito ~380 itens de prateleira/PDV aparecerem no cardápio da
  mesa por engano. Corrigido com `available: false` em todo produto
  novo (usuário confirmou).
- Categoria única "Loja" para todo produto novo (em vez de recriar as 7
  categorias da VHSYS, que cobririam só ~90 dos ~380 produtos novos
  mesmo assim). Setor único "Loja", sem impressão.
- Produto já existente: nunca muda nome, preço, categoria, setor,
  unidade, disponibilidade — só preenche campo novo hoje vazio. Preço
  não é atualizado pela planilha (usuário ajusta manualmente quando
  quiser).

Script: `scripts/import-vhsys-produtos-2026-10-14.ts` (mantido no
repositório como registro histórico da execução, não como ferramenta
reutilizável — mesmo racional de uma migration). Rodado primeiro em modo
simulação (`DRY_RUN=1`, mesma lógica, sem gravar nada) para conferir os
números batiam com o esperado, só depois em modo real, com confirmação
explícita do usuário.

**Resultado da execução real** (lote `cmv8k3wt300lntuqwwig5zmad`):

| Resultado | Quantidade |
|---|---|
| Criados | 379 |
| Atualizados (correspondidos, nome preservado) | 28 |
| Ignorados | 2 (linha "TAXA DE SERVIÇO" sem produto; código `FL0001`, duplicata de preço desatualizado da Fanta) |
| Rejeitados | 8 |
| **Total** | **417** |

Os 8 rejeitados falharam por **código de barras duplicado dentro da
própria planilha** — não é um problema do script, é dado real da VHSYS:
sete variantes de "CAIPIRINHA ... 550ML" (`CE-0001`, `CL-0001`, `CM-0001`,
`CM-0002`, `CMM0001`, `CMM0002`, `CV-0001`) compartilham o mesmo código de
barras genérico `619205878491` que já tinha sido usado por "CAIPIRINHA
COCO E LIMÃO - 550ML" (`CCL0002`, criada com sucesso); e "Baden Baden
Witbier" (`BBW0001`) compartilha `7898230716616` com "Baden Baden
Cristal" (`BBC0001`, também já criada). Nenhum desses 8 produtos foi
criado — ficam de fora até alguém corrigir o código de barras na origem
(VHSYS) ou decidir cadastrá-los manualmente sem código de barras.

Verificado depois da execução: 432 produtos no total (53 + 379), **zero
produtos da categoria "Loja" com `available=true`** (não aparecem na
tela de novo pedido), amostra de produto novo conferida campo a campo.

## 0-C. Segunda camada de proteção: categoria controla visibilidade no pedido (2026-10-14)

Pedido do usuário, na sequência: em vez de depender só de `Product.available`
produto a produto, um campo na própria `Category` — `visibleInOrders`,
`DEFAULT true` — decide se os produtos daquela categoria aparecem na tela
de novo pedido (mesas e retiradas). A categoria "Loja" virou `false`;
todas as demais ficaram `true` (nenhuma mudança de comportamento pra
elas). As duas telas de novo pedido (`mesas/[id]/pedidos/novo` e
`retiradas/[id]/pedidos/novo`) passaram a filtrar também por
`category: { visibleInOrders: true }`, **somando-se** a
`active`/`available`, nunca substituindo — um produto só aparece se os
três estiverem certos. Tela de categorias (`/admin/categorias`) ganhou o
campo "Mostrar produtos no novo pedido", padrão marcado para categoria
nova.

Verificado com uma transação desfeita (nunca commitada): marquei
temporariamente um produto real da categoria Loja como `available: true`
e comparei a consulta antiga (sem o filtro) com a nova — a antiga
incluía o produto, a nova não. Nada foi alterado de verdade (rollback).
Migration `20261014130000_category_visible_in_orders`.

---

## 1. Resumo da estrutura atual do cadastro de produtos

`Product` (`prisma/schema.prisma:514`) hoje é deliberadamente enxuto:

```
id, restaurantId, categoryId, defaultSectorId, name, description?, price (Decimal 10,2),
available, active, vhsysProductId (Int?), createdAt, updatedAt
```

- **Identificação interna**: só o `id` (cuid). Não existe código/SKU, código de
  barras, marca, fornecedor, estoque ou dado fiscal nenhum.
- **Preço**: `Product.price` é o preço vigente; `OrderItem.unitPrice` e
  `productNameAtOrder` (`prisma/schema.prisma:619-620`) **congelam** nome e preço no
  momento do lançamento — alterar o produto depois nunca muda venda já feita (regra
  9/10 do CLAUDE.md, confirmado em `docs/database/schema.md:57`). Qualquer campo
  novo precisa respeitar esse mesmo congelamento.
- **Quantidade do item do pedido é inteira** (`OrderItem.quantity Int`,
  `prisma/schema.prisma:621`) — hoje não é possível lançar um pedido de mesa com
  quantidade fracionária (ex.: 0,450 kg). O módulo de Reservas de Assados já usa
  `Decimal(10,3)` para quantidade (`RoastReservationItem.quantity`,
  `prisma/schema.prisma:1032`), mas isso é um módulo separado — comandas de mesa
  não herdam isso automaticamente. **Risco relevante, ver seção 16.**
- **Categoria e setor** (`Category`, `ProductionSector`) são só `name` +
  `sortOrder` + `active`, identificados internamente pelo `id` — nenhum dos dois
  tem hoje um campo de código externo.
- **Modificadores** (`ProductModifierGroup`/`ProductModifier`) são independentes
  da planilha VHSYS (ela não tem esse conceito) — preservados sem alteração.
- **Impressão**: o ticket de pedido usa `productNameAtOrder` (texto já congelado),
  nunca lê `Product` direto — ampliar o cadastro não afeta a impressão existente.
- **Pagamentos**: dependem só de `OrderItem` (preço/quantidade já congelados) —
  nenhuma dependência direta de `Product`.
- **Integração VHSYS já existente (ADR 0007, Fase 1)**: `Product.vhsysProductId`
  guarda o **`id_produto`** da VHSYS (identificador numérico interno DELES,
  obtido via `GET /produtos`), vinculado manualmente produto a produto pela tela
  `/admin/integracoes/vhsys`, para uma Fase 2 futura (ainda não implementada) de
  enviar a venda da mesa pro PDV deles ao fechar a conta.
  **Isto é diferente do "Código do Produto" da planilha** (ver seção 3) — mais
  detalhes na seção 6.

---

## 2. Análise completa das 30 colunas da planilha

Lida a planilha inteira (417 linhas, não uma amostra). Achados por coluna:

| # | Coluna | Vazios | Observação real, confirmada nos dados |
|---|---|---|---|
| 1 | Código do Produto (60) | 1/417 | Alfanumérico, mistura código puramente numérico (159/416, ex. `3307`), com letras (`ACG0001`), hífen (`A-L0001`) e pontos (`21.20.002.0001`). **416 valores únicos** — mas não pode virar número (perderia os alfanuméricos). A 1 linha vazia é a linha 400, ver seção 8. |
| 2 | Tipo (Produto/Servico) | 0 | Só `"Produto"` em todo o arquivo — nenhum serviço nesta exportação. |
| 3 | Nome do Produto (120) | 0 | 415 nomes únicos de 417 — **2 pares de nome duplicado** encontrados (seção 8). |
| 4 | Fornecedor | 327/417 | Nome do fornecedor. **Não é confiável sozinho**: o mesmo `ID Fornecedor` aparece em algumas linhas com o nome preenchido e em outras vazio (ex. `36468894` ora com `AGROPECUARIA MFL LTDA`, ora vazio). |
| 5 | ID Fornecedor | 0 (mas "0" é sentinela) | 417/417 numérico. `"0"` aparece em 327 linhas — é o valor que a VHSYS usa para "sem fornecedor", não um fornecedor real com id 0. 18 valores distintos ao todo (17 fornecedores reais + o sentinela). |
| 6 | Marca (25) | 219/417 | 74 valores distintos, mas com **grafias divergentes do mesmo nome** (ex. `IRMAOS VICENTE` / `IRMÃOS VICENTE` / `Irmaos Vicente` / `Irmãos Vicente` — a mesma marca em 4 formas; `CANTAGALLO`/`CARTAGALLO`; `DOGMA`/`DOGNA`; `MARRUA`/`MARRUÁ`; `DA BODEGA`/`DABODEGA`). Não dá pra normalizar automaticamente com segurança (`DA BOM` pode ou não ser a mesma marca que `DA BODEGA`) — precisa revisão manual pontual. |
| 7 | Estoque Mínimo | 0 | Só 3 valores distintos (`0`, `5`, `2`) — praticamente não usado. |
| 8 | Estoque Máximo | 0 | **Único valor em todo o arquivo é `0`** — campo não utilizado nesta exportação. |
| 9 | Estoque Atual | 0 | Numérico com **muitos valores negativos** (ex. `-1.258`, `-669`, `-31.606000000000002`) — estoque real da operação está dessincronizado no VHSYS, não é erro de exportação. Valores com várias casas decimais são artefato de ponto flutuante do Excel (`IEEE754`), não erro de digitação — precisam ser lidos como `Decimal`, nunca `float`, exatamente como o projeto já faz em outros lugares (regra 20/21 do CLAUDE.md). |
| 10 | Unidade (06) | 24/417 | 7 valores distintos: `UN`(252) + `un`(44), `KG`(84) + `kg`(9), `CX`(2), `FD`(1), e **um `"1"` literal** (1 linha — erro de digitação, não dá pra adivinhar o que deveria ser). Maiúsculo/minúsculo inconsistente precisa normalização (`UN`/`un`→`UN`); `CX`/`FD` são unidades de embalagem, não necessariamente a unidade de venda ao cliente final — precisa confirmação. |
| 11 | Produto Variado (Sim/Não) | 0 | Só `"Não"` no arquivo inteiro — campo existe no VHSYS mas não é usado por eles hoje; sem dado pra migrar. |
| 12 | Valor Venda (Tabela Padrão) | 0 | Numérico, 151 valores distintos, todos preenchidos — mapeamento direto pra `Product.price`, mas ver ressalva comercial na seção 7. |
| 13 | Valor Custo | 0 | Numérico, 270 valores distintos, todos preenchidos. |
| 14 | Peso | 7/417 | Dos 410 preenchidos, **100% são `0`** — campo não carrega dado real nesta exportação. |
| 15 | Peso Liq. | 7/417 | Mesma situação da coluna 14 — só `0`. |
| 16 | ICMS | 165/417 | Dos 252 preenchidos: só 3 valores (`0`, `12`, `19.5`). Os 165 vazios são produtos **ainda sem classificação fiscal no VHSYS** — vazio ≠ zero, não pode virar `0%` na importação. |
| 17 | IPI | 165/417 | 2 valores distintos (`0`, `1.95`) entre os preenchidos. Mesma ressalva do ICMS. |
| 18 | PIS | 165/417 | 4 valores distintos. Mesma ressalva. |
| 19 | COFINS | 165/417 | 4 valores distintos. Mesma ressalva. |
| 20 | Unidade tributável | 417/417 | **100% vazio** — nenhum dado a migrar, só reservar o campo. |
| 21 | Código Benefício Fiscal | 417/417 | **100% vazio**. |
| 22 | Código CEST | 417/417 | **100% vazio**. |
| 23 | NCM (8) | 4/417 | **Achado importante**: 328 valores têm 8 dígitos (correto), mas **85 valores têm só 7 dígitos** (ex. `2013000`, `2011000`) — tudo indica perda do zero à esquerda pelo Excel ao tratar o NCM como número em vez de texto na origem. NCM sempre tem 8 dígitos; isto provavelmente precisa de `0` à esquerda adicionado, mas **não vou presumir isso sem confirmação** (regra do próprio pedido: não inventar dado fiscal). |
| 24 | Código de Barras (GTIN) | 275/417 | A maioria dos produtos **não tem código de barras** (confirma a premissa do pedido). Dos 142 preenchidos: comprimentos `13` (110 — EAN-13, o padrão), `12` (12 — UPC-A), `14` (12), `8` (3 — GTIN-8), mas também **`11` (4 casos) e `4` (1 caso)** — comprimentos que não existem em nenhum padrão GTIN real, claramente dado inválido/truncado na origem. |
| 25 | Tipo Class. (Fiscal) | 335/417 | Dos 82 preenchidos, **100% são `0`** — sem variação, sem sinal do que o campo realmente classifica. |
| 26 | Observações | 408/417 | Só 9 preenchidas, e o conteúdo é heterogêneo: anotações humanas de preço (`"Valor inicial 132,90"`, `"VALOR ANTERIOR - 65,90"`), e até **códigos de produto escritos por engano no campo errado** (`"BMC0001"`, `"BMP0001"`). Não dá pra tratar como dado estruturado — importar como texto livre e revisar as 9 linhas manualmente. |
| 27 | ID Categoria | 0 (mas "0" é sentinela) | **Só 8 valores distintos no arquivo inteiro**: `0` (317 produtos — "sem categoria") + 7 categorias reais (`349813`×21, `348481`×20, `349277`×18, `349865`×16, `349824`×14, `349820`×8, `349276`×3). **A planilha não traz o nome de nenhuma categoria — só o número.** Ver bloqueio na seção 9. |
| 28 | ID Subcategoria | 416/417 | Só 1 produto tem subcategoria preenchida — praticamente não usado. |
| 29 | Situação (Ativo/Inativo) | 0 | Só `"Ativo"` no arquivo inteiro — não há produto inativo nesta exportação (mas o importador precisa tratar o caso mesmo assim, para exportações futuras). |

**Caso especial encontrado (não uma coluna, uma linha)**: a linha 400 tem `Código
do Produto` vazio, nome **`"TAXA DE SERVIÇO"`**, com valores de venda/custo
(`69`/`65`) e estoque negativo (`-44`). Isto não é um produto — é a própria taxa
de serviço do VHSYS, misturada na tabela de produtos pela exportação deles. O
MITIZ Mesas já tem seu próprio conceito de taxa de serviço
(`ServiceCharge`/`CLAUDE.md` §8 regra 15) — **esta linha deve ser ignorada na
importação**, não virar um `Product`. Proponho que o importador a rejeite
automaticamente (nome evidente + código vazio) e mostre isso na prévia, em vez de
simplesmente excluir silenciosamente.

---

## 3. Mapeamento coluna da VHSYS → campo do MITIZ Mesas

| Coluna da planilha | Campo proposto | Observação |
|---|---|---|
| Código do Produto | `Product.sku` (novo, `String?`) | Chave de correspondência primária na importação (seção 10). Nunca tratar como número. |
| Tipo | *(não migra)* | Sempre "Produto" nesta exportação; se um dia vier "Servico", decidir então. |
| Nome do Produto | `Product.name` | Já existe. |
| Fornecedor | `Product.supplierName` (novo, `String?`) | Só informativo — ver ressalva da coluna 4. |
| ID Fornecedor | `Product.supplierCode` (novo, `String?`) | `"0"` vira `null`, nunca um ID de fornecedor de verdade. |
| Marca | `Product.brand` (novo, `String?`) | Sem normalização automática de grafia (seção 2). |
| Estoque Mínimo | `Product.stockMinimum` (novo, `Decimal(10,3)?`) | Baixa prioridade — quase sem dado real. |
| Estoque Máximo | *(não migra por ora)* | 100% zero no arquivo — reservar o campo seria especular. |
| Estoque Atual | `Product.stockQuantity` (novo, `Decimal(10,3)?`) | `null` = "sem controle de estoque" (pedido explícito do usuário), diferente de `0`. Negativos preservados como estão. |
| Unidade | `Product.unit` (novo, `String`, default `"UN"`) | Normalizar só `UN`/`un`→`UN`, `KG`/`kg`→`KG`; `CX`/`FD`/`"1"` ficam para revisão manual (seção 8). |
| Produto Variado | *(não migra)* | Sem dado real no arquivo. |
| Valor Venda | `Product.price` | Já existe — ver ressalva de preço comercial na seção 7. |
| Valor Custo | `Product.costPrice` (novo, `Decimal(10,2)?`) | |
| Peso / Peso Liq. | `Product.weight` / `Product.netWeight` (novos, `Decimal(10,3)?`) | Reservados — sem dado real nesta exportação (100% zero). |
| ICMS/IPI/PIS/COFINS | `Product.icmsRate`/`ipiRate`/`pisRate`/`cofinsRate` (novos, `Decimal(5,2)?`) | `null` quando vazio na planilha — nunca `0` por omissão. |
| Unidade tributável | `Product.taxableUnit` (novo, `String?`) | Reservado, sem dado para migrar agora. |
| Código Benefício Fiscal | `Product.fiscalBenefitCode` (novo, `String?`) | Reservado. |
| Código CEST | `Product.cest` (novo, `String?`) | Reservado. |
| NCM | `Product.ncm` (novo, `String?`, não `Int`) | Preservar exatamente como vier; preenchimento do zero à esquerda é uma decisão separada (seção 9), não automática. |
| Origem | `Product.origin` (novo, `Int?`, 0-8) | |
| Código de Barras | `Product.barcode` (novo, `String?`) | Comprimento inválido (nem 8/12/13/14) fica marcado como alerta na prévia, não rejeitado nem corrigido sozinho. |
| Tipo Class. (Fiscal) | `Product.fiscalClassType` (novo, `String?`) | Reservado — sem significado claro ainda (só visto `"0"`). |
| Observações | `Product.importNotes` (novo, `String?`) | **Não** reaproveita `Product.description` (que já é um campo operacional do MITIZ, pode estar preenchido com outra coisa) — campo separado para não sobrescrever nada. |
| ID Categoria | `Category.externalCode` (novo, `String?`, no model `Category`, não em `Product`) | Ver bloqueio na seção 9 — precisa de uma decisão humana, uma vez por categoria (só 7 IDs reais), não por produto. |
| ID Subcategoria | *(não migra por ora)* | Só 1 produto no arquivo inteiro — sem justificar modelo novo agora. |
| Situação | `Product.active` | Já existe (`Ativo`→`true`, `Inativo`→`false`). Nunca apaga o produto. |

**Dois campos que a planilha NÃO tem e o cadastro atual exige:**
`Product.categoryId` e `Product.defaultSectorId` são obrigatórios no schema hoje
(`NOT NULL`) e **não existem na exportação do VHSYS**. A importação de produto
novo vai precisar de uma decisão do administrador (categoria e setor de produção
padrão) na prévia — não dá pra inferir isso da planilha. Detalhado na seção 9.

---

## 4. Campos já existentes, novos campos necessários

**Já existentes, reaproveitados sem mudança**: `name`, `price`, `active`,
`available`, `description`, `categoryId`, `defaultSectorId`,
`vhsysProductId` (mantido intacto — é outra coisa, ver seção 6).

**Novos campos em `Product`** (todos opcionais, exceto `unit` com default — nenhum
quebra produto existente): `sku`, `barcode`, `brand`, `unit`, `costPrice`,
`stockQuantity`, `stockMinimum`, `weight`, `netWeight`, `ncm`, `cest`, `origin`,
`icmsRate`, `ipiRate`, `pisRate`, `cofinsRate`, `taxableUnit`,
`fiscalBenefitCode`, `fiscalClassType`, `supplierName`, `supplierCode`,
`importNotes`.

**Novo campo em `Category`**: `externalCode String?` — guarda a decisão de
mapeamento ID→categoria feita uma vez, para a próxima importação já reconhecer
automaticamente.

**Novos modelos** (trilha de auditoria da importação, regra 22 do CLAUDE.md — ver
seção 11): `ProductImportBatch` (um registro por execução: quem importou, quando,
nome do arquivo, hash do arquivo, status, contagens finais) e
`ProductImportRow` (uma linha por produto da planilha processado: código,
resultado — criado/atualizado/ignorado/rejeitado —, e o motivo quando rejeitado).

---

## 5. Proposta de organização da nova tela de produtos

Mantém a tela atual (`/admin/produtos`) como listagem — ela já é compacta (Nome,
Categoria, Setor, Preço, Disponível). Proposta: acrescentar colunas opcionais
*Código* e *Estoque* (só quando preenchidos), e um campo de busca que já aceite
nome, `sku` ou `barcode` (preparando o terreno do PDV, pedido explícito do
usuário na seção 5 do pedido original — sem implementar o PDV em si).

O formulário de produto (hoje uma tela única e curta) passa a usar abas/seções,
exatamente como o usuário sugeriu, reaproveitando os componentes já existentes
(`Card`, `TextField`, `SelectField` — `docs/design/design-system.md`):

1. **Dados gerais** — nome, código (`sku`), código de barras, marca, categoria,
   subcategoria *(não — não existe praticamente nenhum dado, fica de fora)*,
   setor de produção, situação.
2. **Preços** — preço de venda (já existe), custo.
3. **Estoque** — estoque atual, mínimo, unidade, peso/peso líquido.
4. **Dados fiscais** — NCM, CEST, origem, ICMS/IPI/PIS/COFINS, unidade
   tributável, benefício fiscal, classificação fiscal. Seção claramente marcada
   como "não usada em nenhum fluxo hoje — preparação para emissão fiscal futura",
   para não confundir quem cadastra um produto novo manualmente.
5. **Fornecedor** — nome, ID externo (campo informativo).
6. **Informações adicionais** — descrição (campo já existente, uso operacional do
   MITIZ), observações da VHSYS (`importNotes`, só leitura depois de importado —
   não editável manualmente, para não se confundir com a descrição operacional),
   disponibilidade, modificadores (seção já existente, inalterada).

Nenhuma seção nova é obrigatória para cadastrar um produto manualmente — só
"Dados gerais" + "Preços" continuam obrigatórios, como hoje.

---

## 6. Proposta de alterações no banco de dados

Uma migration (`prisma migrate deploy`, mesmo processo já usado no projeto):

```prisma
model Product {
  // ...campos existentes, sem alteração...

  sku              String?  // "Código do Produto" da VHSYS — ou cadastro manual futuro
  barcode          String?  // GTIN-8/12/13/14, quando existir
  brand            String?
  unit             String   @default("UN")
  costPrice        Decimal? @db.Decimal(10, 2)
  stockQuantity    Decimal? @db.Decimal(10, 3) // null = sem controle de estoque
  stockMinimum     Decimal? @db.Decimal(10, 3)
  weight           Decimal? @db.Decimal(10, 3)
  netWeight        Decimal? @db.Decimal(10, 3)
  ncm              String?
  cest             String?
  origin           Int?
  icmsRate         Decimal? @db.Decimal(5, 2)
  ipiRate          Decimal? @db.Decimal(5, 2)
  pisRate          Decimal? @db.Decimal(5, 2)
  cofinsRate       Decimal? @db.Decimal(5, 2)
  taxableUnit      String?
  fiscalBenefitCode String?
  fiscalClassType  String?
  supplierName     String?
  supplierCode  String?
  importNotes       String?
  // vhsysCodProduto é o mesmo que `sku` nesta proposta — ver nota abaixo.

  @@unique([restaurantId, sku])   // quando sku não é nulo
  @@unique([restaurantId, barcode]) // quando barcode não é nulo
  @@index([restaurantId, sku])
  @@index([restaurantId, barcode])
}

model Category {
  // ...campos existentes...
  externalCode String?
  @@unique([restaurantId, externalCode])
}

model ProductImportBatch {
  id             String   @id @default(cuid())
  restaurantId   String
  fileName       String
  fileHash       String   // SHA-256 do arquivo — detecta reimportação do mesmo arquivo
  importedById   String
  status         ProductImportBatchStatus @default(PENDING)
  totalRows      Int
  createdCount   Int @default(0)
  updatedCount   Int @default(0)
  skippedCount   Int @default(0)
  rejectedCount  Int @default(0)
  startedAt      DateTime @default(now()) @db.Timestamptz(6)
  confirmedAt    DateTime? @db.Timestamptz(6)
  finishedAt     DateTime? @db.Timestamptz(6)

  rows ProductImportRow[]
  @@index([restaurantId])
}

model ProductImportRow {
  id             String   @id @default(cuid())
  batchId        String
  rowNumber      Int
  sku            String?
  productName    String
  outcome        ProductImportRowOutcome // CREATED | UPDATED | SKIPPED | REJECTED
  reason         String?   // obrigatório quando REJECTED, opcional nos demais
  productId      String?   // produto resultante, quando aplicável

  batch ProductImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  @@index([batchId])
}
```

**Nota sobre nomenclatura (`sku` vs. `vhsysCodProduto`)**: decidi propor `sku`
(genérico) em vez de `vhsysCodProduto` porque este campo vai virar a base de busca
do futuro PDV (seção 5 do pedido original) — não é exclusivo da origem VHSYS, é
o código interno do produto no MITIZ dali para frente, mesmo que tenha vindo de
lá na primeira carga. **Isto é uma escolha de nome, não uma decisão técnica
fechada — se preferir manter o nome explícito `vhsysCodProduto` para deixar claro
de onde veio, eu troco antes de implementar.**

**Nenhuma coluna existente muda de tipo ou fica `NOT NULL`.** Nenhum dado
histórico (`OrderItem`, pagamentos, impressões) é tocado por esta migration.

---

## 7. Estratégia de importação e atualização de produtos

Server Action + tela administrativa nova, `/admin/produtos/importar-vhsys`
(permissão `ADMIN_MANAGE`, reaproveitada), em etapas, como pedido:

**A — Selecionar arquivo**: upload de `.xlsx` (tamanho máx. razoável, ex. 10 MB —
o arquivo de hoje tem 57 KB). Processado em memória na Server Action (o volume
atual, ~400 linhas, não justifica fila/job assíncrono).

**B — Analisar arquivo**: parse do Excel (proponho adicionar a dependência
`xlsx`/SheetJS ou `exceljs` — nenhuma lib de planilha está instalada no projeto
hoje; preciso da sua aprovação para adicionar, por ser pacote novo). Valida
cabeçalho (as 30 colunas esperadas, na ordem ou por nome), tipo de cada célula, e
devolve erro claro se o arquivo não bate com o formato esperado — sem tentar
adivinhar um formato diferente.

**C — Prévia**: calculada, nunca gravada no banco ainda. Mostra, por linha:
- Produto novo (nenhum `sku`/`barcode` corresponde a um produto existente);
- Produto existente que seria atualizado (campo a campo: o que muda, o que fica
  igual);
- Conflito (ex.: duas linhas da planilha com o mesmo `sku`, ou `sku` que bate em
  mais de um produto do MITIZ — não deveria acontecer, mas o importador confere);
- Inválido/incompleto (ex.: a linha 400 "TAXA DE SERVIÇO", `ID Categoria`/`Unidade`
  sem correspondência confirmada);
- Ignorado (quando o administrador decidir, na própria tela, pular uma linha
  específica).

**D — Conferência**: ver seção 9 (categorias) e seção 10 (correspondência de
produto) em detalhe — é a etapa mais sensível de toda a proposta.

**E — Confirmação**: só grava no banco depois de um clique explícito de
confirmação, dentro de uma transação (`prisma.$transaction`, mesmo padrão já
usado em `create-reservation.ts` etc.) — tudo ou nada por lote, nunca uma
importação parcialmente aplicada sem o administrador saber.

**F — Resultado**: tela com os contadores finais (criados/atualizados/
ignorados/rejeitados) e um link para `ProductImportRow` filtrável por resultado,
pra consultar exatamente o que aconteceu com cada linha — fica registrado,
consultável depois, não só na hora.

---

## 8. Estratégia de identificação de duplicidades

Dentro da própria planilha, antes mesmo de comparar com o banco:

- **Dois pares de nome duplicado, achados de verdade**: `BRISKET DEFUMADO`
  (códigos `3307` e `3310`) e `FANTA LARANJA LATA 350ml` (códigos `FL0001` e
  `FLL0001`). Nenhum dos dois é resolvido automaticamente — a prévia (etapa C)
  mostra os dois como alerta de "nomes muito parecidos", e o administrador decide
  se são produtos diferentes de verdade (ex. dois cortes de brisket) ou um
  cadastro duplicado no próprio VHSYS (nesse caso, provavelmente um `FLL0001` foi
  criado por engano e deveria ser ignorado — decisão do administrador, não do
  importador).
- **`sku` repetido na planilha** (não encontrado nesta exportação — os 416
  códigos são únicos — mas o importador precisa validar isso sempre, já que uma
  exportação futura pode ter): linha rejeitada com motivo explícito, nunca as
  duas importadas.

---

## 9. Tratamento de categorias e fornecedores

**Categorias — o bloqueio mais importante desta proposta**: a planilha identifica
categoria só por número (`ID Categoria`), sem nome nenhum em lugar nenhum do
arquivo. São só 8 valores distintos no total (`0` = sem categoria, mais 7 IDs
reais). Não dá pra adivinhar o nome de `349813` ou `348481`.

**Preciso de uma destas duas coisas antes da Etapa D funcionar de verdade:**
1. Você me diz o nome de cada uma das 7 categorias (ex. "349813 = Bebidas",
   "348481 = Carnes"), e eu uso isso como mapeamento inicial; ou
2. A Etapa D da tela deixa um seletor "o que é a categoria 349813 no VHSYS?"
   apontando para uma categoria já existente no MITIZ ou criando uma nova — feito
   uma vez por ID (só 7 vezes), fica salvo em `Category.externalCode` e nunca
   mais precisa ser perguntado de novo nas próximas importações.

Proponho implementar a opção 2 de qualquer forma (é necessária para importações
futuras), mas se você já souber os nomes agora, a primeira importação fica mais
rápida com a opção 1 como atalho.

Produtos com `ID Categoria = 0` (317 dos 417) entram sem categoria resolvida — o
administrador escolhe uma categoria (existente ou nova) por produto, ou em lote.

**Fornecedores**: tratados como campo informativo (`supplierName`/
`supplierCode`), sem virar tabela própria nesta etapa — são só 17
fornecedores reais e nenhuma tela hoje precisa de um cadastro de fornecedor
separado. Se isso mudar no futuro (ex. relatório de compras por fornecedor), dá
pra promover para um model `Supplier` depois, sem perda de dado (os dois campos
já guardam tudo que a planilha tem).

---

## 10. Tratamento dos produtos já utilizados em pedidos

Esta é a regra mais importante de toda a proposta, e nenhuma parte dela muda
identificador interno nem apaga histórico:

- **Produto já existente no MITIZ, correspondido pela importação** (seção
  seguinte explica como): `UPDATE` no `Product` já existente, preservando o
  `id` (cuid) — os `OrderItem` antigos continuam apontando pro mesmo produto,
  e como preço/nome já estão congelados neles, vendas passadas não mudam.
- **Nunca `DELETE`**: um produto que *sumiu* da planilha nova (existia antes, não
  está mais lá) **não é apagado** — fica como está. A planilha é usada só para
  criar/atualizar, nunca para decidir o que remover.
- **Preço de venda (`price`)**: decisão do usuário (seção 0, item 3) — **sempre
  atualiza conforme o valor da planilha**, sem perguntar produto a produto. A
  prévia (Etapa C) ainda mostra o valor atual ao lado do novo, só como
  informação, mas a confirmação já aplica a atualização para todos os produtos
  correspondidos, sem passo extra de escolha. Os campos novos (estoque, fiscal,
  código de barras etc.), que hoje **não existem** no MITIZ, são preenchidos
  diretamente, pois não há "configuração operacional existente" para conflitar.
- **Correspondência por identificador, nunca só por nome** (pedido explícito):
  ordem de prioridade — `sku` exato → `barcode` exato → nenhum dos dois bate,
  vira candidato a produto novo, com o nome só usado para *alertar* sobre
  possível duplicata (ex.: "já existe um produto chamado 'Água Onda Leve' no
  MITIZ, mas sem `sku`/`barcode` — é o mesmo produto?"), nunca para decidir
  sozinho.

**Observação importante sobre a primeira importação**: como o cadastro atual do
MITIZ não tem `sku` nem `barcode` em nenhum produto hoje (campos novos, todos
`null`), a correspondência automática por identificador **não vai encontrar
nada** na primeira rodada — todo item vai aparecer como "produto novo" a menos
que o administrador o pareie manualmente na Etapa D com um produto já existente
do MITIZ (usando o nome como pista, não como decisão automática). A tela de
conferência precisa de uma busca/sugestão por nome parecido **assistindo** essa
decisão manual, sem decidir sozinha. Da segunda importação em diante (já com
`sku` gravado), a correspondência automática funciona plenamente.

---

## 11. Segurança da importação

- **Nunca roda direto em produção sem autorização explícita** (pedido do
  usuário) — a sequência A→F sempre passa pela prévia (C) e confirmação (E)
  antes de qualquer `INSERT`/`UPDATE`.
- **Transação única por lote**: se qualquer linha falhar de forma inesperada
  durante a gravação (não durante a prévia — erros esperados já foram filtrados
  antes), a transação inteira desfaz, e o `ProductImportBatch` fica marcado
  `FAILED` — nunca uma importação "pela metade" sem registro.
- **Proteção contra duplicar com reimportação do mesmo arquivo**: o
  `fileHash` (SHA-256) do upload é comparado com `ProductImportBatch` recentes do
  mesmo restaurante — se for idêntico a um já confirmado, a tela avisa antes de
  deixar prosseguir ("este arquivo já foi importado em [data], quer continuar
  mesmo assim?"). Reimportar o mesmo arquivo depois de editar produtos manualmente
  não duplica nada de qualquer forma, porque a correspondência é por `sku`, não
  por criação cega.
- **Modo simulação (decisão da seção 0, item 7)**: a Etapa E ganha uma segunda opção
  além de "Confirmar importação" — **"Simular importação"**. As duas rodam
  exatamente o mesmo código, dentro da mesma `prisma.$transaction`: parse,
  correspondência, criação/atualização e todas as validações/constraints reais
  do banco (`@@unique`, `onDelete: Restrict` etc.) são executadas de verdade.
  A única diferença é que, em modo simulação, a função lança um erro sentinela
  (`SimulationRollbackError`) como última instrução dentro da transação — o
  Prisma desfaz tudo automaticamente, e o código fora da transação captura esse
  erro específico (nunca um erro de verdade) e trata como sucesso, só que sem
  nada persistido. `ProductImportBatch.status` fica `SIMULATED` em vez de
  `COMPLETED`, com todas as `ProductImportRow` gravadas normalmente (a tabela de
  log não está dentro da transação que é desfeita — grava à parte, depois). Isso
  testa contra o banco de produção de verdade, com os dados reais de hoje, sem
  precisar de um ambiente separado e sem nenhum risco de gravação.
- **Backup**: o Supabase do projeto já faz backup automático do Postgres (padrão
  do serviço) — antes da importação definitiva (Fase 6), proponho confirmar o
  ponto de restauração disponível e, se for importante pra você, tirar um dump
  manual adicional antes de confirmar.

---

## 12. Preparação fiscal

Os campos fiscais (seção 2, colunas 16-25) são preservados porque existem na
planilha, mas **nenhum deles é usado em fluxo nenhum do MITIZ hoje** — isto fica
explícito na interface (seção 5) para não passar a impressão de que o sistema já
emite nota fiscal ou calcula imposto.

**Necessidades futuras identificadas, fora do escopo atual** (só registrando,
sem implementar):
- `Unidade tributável`, `Código Benefício Fiscal` e `Código CEST` estão 100%
  vazios nesta exportação — quando a emissão fiscal for implementada, esses
  dados provavelmente precisarão ser completados produto a produto, não há nada
  pra herdar do VHSYS hoje.
- Os 85 NCMs com 7 dígitos (seção 2) precisam de revisão antes de qualquer uso
  fiscal real — importar como veio preserva o dado original para auditoria, mas
  não deve ser usado para gerar nota fiscal sem essa correção confirmada.
- ICMS/IPI/PIS/COFINS vazios (165 produtos, ~40%) não têm classificação
  tributária nenhuma ainda no VHSYS — a emissão fiscal futura desses produtos
  dependeria de completar isso lá ou aqui, é trabalho adicional não coberto por
  esta importação.

---

## 13. Estratégia para códigos de barras e produtos vendidos por peso

- **Código de barras**: campo opcional (`barcode`), nunca obrigatório — 275 dos
  417 produtos não têm. Busca por código de barras (preparação do PDV) soma-se à
  busca por nome e por `sku`, sem substituir nenhuma delas.
- **Comprimento inválido** (os 5 casos de comprimento 11 e 4, seção 2): entram na
  prévia como alerta "código de barras com formato não reconhecido", mas são
  importados mesmo assim como texto (não descartados nem corrigidos
  automaticamente) — o administrador decide se apaga, corrige manualmente ou
  ignora.
- **Produtos vendidos por peso (KG)**: o cadastro passa a saber que um produto é
  vendido por `KG` (`Product.unit`), mas **isto sozinho não permite lançar
  quantidade fracionária numa comanda de mesa hoje**, porque `OrderItem.quantity`
  é inteiro (seção 1). Ver risco explícito na seção 16 — decisão a tomar antes da
  Fase 2 do plano de implementação, não durante esta etapa de cadastro.

---

## 14. Como funcionará a prévia antes da importação

Tudo calculado em memória a partir do parse da planilha + uma consulta de
leitura no banco (produtos/categorias existentes) — **nenhuma escrita** acontece
até a Etapa E. A prévia é reexecutada (não cacheada) sempre que o administrador
muda uma decisão de conferência (ex. escolhe uma categoria para um ID da VHSYS),
para refletir o efeito daquela escolha nas linhas afetadas antes de confirmar.

---

## 15. Como garantir a integridade do banco atual

- Migration só adiciona colunas opcionais e tabelas novas — nenhuma coluna
  existente muda de tipo, nenhuma constraint existente é alterada.
- `OrderItem`, `Payment`, `PrintJob` e tudo que já referencia `Product` por `id`
  continua funcionando sem nenhuma mudança de código nessas áreas — só leem
  campos que já existiam.
- A importação em si roda numa transação; falhou, desfez.
- Nenhuma regra de negócio existente (preço congelado, setor obrigatório, taxa de
  serviço separada de produto) é contornada pelo importador — pelo contrário, a
  linha "TAXA DE SERVIÇO" (seção 2) é identificada e tratada à parte justamente
  para não violar essa separação.

---

## 16. Riscos e dúvidas que precisam ser resolvidos antes de implementar

1. **Nomes das 7 categorias da VHSYS** (seção 9) — preciso que você informe, ou
   aceita resolver interativamente na tela, uma vez por categoria?
2. **Setor de produção padrão para produtos novos** — a planilha não tem essa
   informação (não existe no VHSYS). Proponho: um seletor "setor padrão desta
   importação" na Etapa D, aplicável a todos os produtos novos de uma vez, com
   opção de ajustar individualmente antes de confirmar. Confirma essa estratégia?
3. **Preço de venda: atualizar ou manter o do MITIZ quando os dois já
   existirem?** (seção 10) — proponho mostrar lado a lado e deixar o
   administrador decidir por produto (ou "atualizar todos"/"manter todos" como
   atalho). Confirma?
4. **Quantidade fracionária em pedido de mesa** (seção 1 e 13) — esta proposta
   **não** inclui mudar `OrderItem.quantity` de inteiro para decimal, porque isso
   afeta cálculo de subtotal, impressão e o fluxo de pedidos inteiro, fora do
   escopo "cadastro + importador" que você definiu. Produtos vendidos por KG
   ficam corretamente identificados como tal no cadastro, mas até essa mudança
   futura (se você quiser) ser feita à parte, o lançamento na comanda continua
   em unidades inteiras, mesmo para um produto marcado `KG`. Isto é aceitável
   para esta etapa, ou é bloqueante?
5. **Biblioteca de leitura de Excel**: nenhuma está instalada no projeto —
   proponho `xlsx` (SheetJS) ou `exceljs`. Preciso da sua aprovação para
   adicionar a dependência (CLAUDE.md §17, não instalar pacote sem explicar
   necessidade — aqui a necessidade é literalmente ler o arquivo que você vai
   enviar pela tela).
6. **Os 2 pares de nome duplicado e a linha "TAXA DE SERVIÇO"** (seção 2 e 8) —
   confirmo que devo tratá-los exatamente como descrito (TAXA DE SERVIÇO
   ignorada automaticamente com aviso; duplicados de nome só alertados, decisão
   manual)?
7. **Ambiente de teste da importação** (seção 11) — hoje não existe um banco de
   staging separado do de produção (único Supabase do projeto). Quer que eu
   monte uma estratégia de teste mais isolada antes da Fase 4 (ex. banco de
   desenvolvimento local, ou um "modo simulação" que roda tudo menos o commit
   final), ou testar com a prévia + lote pequeno já é suficiente pra você?
8. **Nome do campo `sku` vs. `vhsysCodProduto`** (seção 6) — qual prefere?

---

## 17. Exemplos práticos das três situações pedidas

### Situação 1 — produto existe no VHSYS, não existe ainda no MITIZ

Linha da planilha: `Código do Produto = "ANCHO ANGUS ESTANCIA 92"` *(na verdade
o código real é algo como `AEA0001`, nome `"ANCHO ANGUS ESTANCIA 92"`)*, sem
`sku`/`barcode` correspondente em nenhum `Product` existente. Resultado na
prévia: **"Novo"**. Na confirmação, cria um `Product` com todos os campos
mapeados (seção 3), categoria resolvida pelo mapeamento da seção 9, setor padrão
escolhido pelo administrador (seção 16, item 2), e `ProductImportRow` grava
`outcome = CREATED`.

### Situação 2 — produto existe nos dois sistemas, precisa atualizar sem perder histórico

Exemplo real do arquivo: um produto como `AMSTEL LATA`, já cadastrado
manualmente no MITIZ hoje (sem `sku`), pareado manualmente pelo administrador na
primeira importação (seção 10, "observação importante"). A partir da segunda
importação, a linha da planilha já bate pelo `sku` gravado. Se o `Valor Venda` da
planilha mudou de R$ 6,90 para R$ 7,50: a prévia mostra "preço atual R$ 6,90 →
planilha R$ 7,50", o administrador decide atualizar ou não. Se atualizar: o
`Product.price` muda, mas todo `OrderItem` já lançado antes continua com
`unitPrice` congelado no valor da venda original — nenhuma venda passada muda de
valor. `ProductImportRow` grava `outcome = UPDATED` com os campos que mudaram.

### Situação 3 — informação fiscal incompleta ou conflitante, exige revisão

Exemplo real do arquivo: um produto com NCM de 7 dígitos (ex. `"2011000"`, linha
onde isso ocorre) e `ICMS` vazio. A prévia marca a linha como **"dados fiscais
incompletos"** (não "inválido" — o produto em si é importado normalmente, nome e
preço estão ok), com um aviso específico: "NCM com 7 dígitos, pode estar faltando
um zero à esquerda — revisar antes de usar para fins fiscais" e "ICMS não
informado no VHSYS". O produto é criado/atualizado normalmente (os dados
comerciais não dependem do fiscal), mas o `ncm`/`icmsRate` ficam gravados
exatamente como vieram (`"2011000"`, `null`), nunca "corrigidos" sozinhos, e o
`ProductImportRow` registra o aviso para consulta posterior.

---

## 18. Como serão realizados os testes

- **Unitários**: parser da planilha (casos de coluna vazia, código duplicado,
  NCM curto, unidade inconsistente, linha "TAXA DE SERVIÇO"), lógica de
  correspondência (`sku`/`barcode`/novo), e a lógica pura de prévia (sem banco).
- **Integração**: fluxo completo contra banco de teste — primeira importação
  (tudo novo), segunda importação do mesmo arquivo (tudo bate por `sku`, nada
  duplica), importação com conflito de categoria não resolvida (deve bloquear a
  confirmação até o administrador decidir), transação desfeita em falha
  simulada.
- **Manual, antes da importação definitiva**: rodar com o arquivo real contra o
  banco de teste/staging (seção 16, item 7), conferir a prévia inteira com você
  antes de confirmar.

---

## 19. Plano de implementação dividido em etapas pequenas

Mesma sequência que você pediu, cada uma só começa depois que a anterior estiver
pronta e você validar:

1. **Ajustes no banco de dados** — migration da seção 6 (só schema, nenhuma tela
   nova ainda). Testes unitários do schema/domínio.
2. **Ampliação da tela de produtos** — seções do formulário (seção 5), listagem
   com busca por nome/`sku`/`barcode`. Produtos existentes continuam funcionando
   sem nenhum dos campos novos preenchidos.
3. **Desenvolvimento do importador** — telas A a F (seção 7), sem rodar contra
   produção ainda.
4. **Importação de teste** — em "modo simulação" (seção 0, item 7 e seção 11),
   com o arquivo real, contra o banco de produção, sem gravar nada.
5. **Validação dos resultados** — conferência conjunta dos contadores e das
   linhas problemáticas, ajustes no importador se algo não bateu com o esperado.
6. **Importação definitiva** — só depois da sua autorização explícita, contra
   produção, com backup confirmado antes (seção 11).

---

## Resumo do que preciso de você antes de começar

~~As 8 perguntas da seção 16, e a aprovação geral da estratégia.~~ Respondidas
em 2026-10-14 (seção 0). Fase 1 (banco de dados) implementada nesta revisão;
Fase 2 (tela de produtos) começa depois de validar o resultado da Fase 1 com
você, conforme o próprio plano da seção 19. **Até a Fase 1, nenhum código tinha
sido alterado para produzir a análise** — só leitura do schema, do código
existente e da planilha.
