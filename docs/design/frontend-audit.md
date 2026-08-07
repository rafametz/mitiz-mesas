# Auditoria de Frontend — MITIZ Mesas

Data: 2026-08-06.
Executada seguindo `.claude/skills/frontend-modernization/SKILL.md`, com
base em `CLAUDE.md`, `.claude/skills/frontend-design/SKILL.md` e
`docs/design/design-system.md`. Nenhum código foi alterado nesta etapa.

## Contexto — isso não é uma base "legada"

Diferente de um frontend genérico gerado sem direção, este projeto já
passou por uma repaginação visual deliberada (ver "Repaginação visual" e
itens seguintes em `docs/backlog.md`): tokens de marca reais (`wine`,
`gold`, `bg`/`ink` claros, `shell` escuro só na navegação), tipografia
pareada (Fraunces + Manrope), logotipo oficial, navegação mobile-first
(bottom nav) e um painel administrativo (`/admin/mesas`) com indicadores,
gráfico de rosca e alertas. A auditoria abaixo não trata isso como
desatualizado — foca no que ficou incompleto ou inconsistente **depois**
dessa repaginação, e no que nunca chegou a ser feito (a maioria dos
"componentes prioritários" listados em `design-system.md`).

## Como ler a classificação

- **Crítico**: viola uma exigência explícita do `CLAUDE.md`/skill, ou tem
  risco operacional real (ex.: pode quebrar a impressão ao vivo sem
  aviso). Deve ser tratado antes de qualquer polimento visual.
- **Alto**: inconsistência ou lacuna sistemática, presente em várias
  telas, que já causa duplicação de código e vai piorar conforme o
  sistema cresce (Módulo 8+).
- **Médio**: afeta uma tela ou uma categoria específica, não é
  sistemático, mas vale corrigir num incremento.
- **Baixo**: polimento, ou item fora do escopo atual (ex.: módulo ainda
  não implementado) — registrado para não ser esquecido, sem urgência.

---

## 1. Organização visual e aparência geral

Estrutura consistente: tokens de cor de marca aplicados via Tailwind
(`wine`/`gold`/`bg`/`ink`/`shell`), tipografia Fraunces (display) +
Manrope (corpo) via `next/font/google`, raio de card único
(`rounded-card`, 14px), paleta de status (`free`/`wine`/`gold`/`muted`)
usada de forma coerente em badges e faixas de card. A personalidade
"premium sem exagero" do `design-system.md` está presente na prática:
sem gradientes, sem sombras decorativas, contraste alto, tipografia
comedida.

- **[Médio] Documentação do design system desatualizada em relação à
  implementação real.** `docs/design/design-system.md` descreve fundo
  "grafite profundo" (tema escuro). A implementação real
  (`tailwind.config.ts`) é deliberadamente um tema **claro** (bege
  `#F2ECE6` + texto quase-preto), com o grafite reservado só à navegação
  — decisão documentada em comentário no próprio arquivo, e claramente
  correta para operação em ambiente de restaurante (legibilidade rápida
  sob luz variável). O problema não é a decisão, é que `design-system.md`
  nunca foi atualizado para refletir essa mudança — qualquer pessoa (ou
  IA) que ler só o doc vai propor componentes na paleta errada.

- **[Baixo] Painel `/admin/mesas` é visivelmente mais denso que o grid
  `/mesas` do garçom** (indicadores, gráfico de rosca, painel de
  alertas vs. grid simples de cards). Isso é intencional e documentado no
  backlog (públicos diferentes: administrador à distância vs. garçom com
  uma mão no celular), mas os dois "grids de mesa" do sistema comunicam
  em linguagens visuais bem diferentes — vale ficar atento para não
  divergir ainda mais sem necessidade real.

## 2. Navegação

- Bottom nav fixa no app do garçom/caixa (`(staff)/bottom-nav.tsx`) —
  ícones + rótulo, área de toque de altura adequada (`py-3`), item ativo
  marcado por cor **e** `aria-current="page"` (não depende só de cor).
  Sem problemas.
- Abas da mesa (`mesa-tabs.tsx`) e abas de setor da produção — mesmo
  padrão consistente (`border-b-2` + ícone), com scroll horizontal em
  telas estreitas. Sem problemas.

- **[Baixo] Nenhum item de navegação para Módulo 8+ ainda.** Esperado —
  Pagamentos/Auditoria/Usuários não existem como telas ainda. Só registrar
  para lembrar de adicionar entradas de nav junto com cada módulo novo,
  não retroativamente.

## 3. Sidebar (admin)

`admin/sidebar-nav.tsx` — vira barra horizontal com scroll em telas
estreitas (`md:flex-col` só a partir de `md`), o que é uma resposta
razoável dado que a área admin é desktop-first por decisão de produto
(CLAUDE.md §5: Administrador). Item ativo com `aria-current` e cor de
fundo, não só cor de texto — legível.

- **[Baixo] `SidebarNav` só lista 5 dos 9 itens previstos no CLAUDE.md
  §10** (Mesas, Setores, Categorias, Produtos, Impressoras — faltam
  Usuários, Formas de pagamento, Configurações, Auditoria). Não é defeito
  — são telas que ainda não existem. Sinalizado porque a lista está
  hard-coded (`NAV_ITEMS` array simples) e vai precisar rever
  espaçamento/agrupamento quando crescer para 9 itens (hoje cabe bem
  numa coluna estreita; com quase o dobro de itens pode precisar de
  seções/agrupamento).

## 4. Cabeçalhos

`PageHeader` (`src/components/ui/card.tsx`) existe e é usado em Mesas,
Produtos, Impressoras, Produção, Admin Mesas.

- **[Médio] `PageHeader` não é usado de forma consistente.** A tela da
  Mesa individual (`mesas/[id]/layout.tsx`) tem seu próprio cabeçalho
  customizado (correto — precisa do badge de status e do botão voltar,
  que `PageHeader` não suporta), mas a tela de Novo pedido
  (`pedidos/novo/new-order-form.tsx`) não tem cabeçalho de página
  nenhum — só o `<h2>` "Adicionar item" da primeira seção, sem título
  "Novo pedido" nem indicação de qual mesa. Quem chega direto num link
  ou volta de um refresh perde o contexto de qual mesa está editando até
  rolar a página (o layout pai mostra "Mesa X" acima, mas a subpágina
  "Novo pedido" não reforça isso).

## 5. Cards

`Card` (`src/components/ui/card.tsx`) existe: `rounded-card border
border-line bg-surface p-4`.

- **[Alto] O componente `Card` compartilhado é usado em pouquíssimos
  lugares — a mesma marcação é reescrita manualmente dezenas de vezes.**
  Exemplos confirmados que duplicam exatamente `rounded-card border
  border-line bg-surface p-{3,4}` em vez de importar `Card`: cada pedido
  em `pedidos/page.tsx`, cada item do carrinho em `new-order-form.tsx`,
  cada job em `impressao/page.tsx`, cada sessão em `historico/page.tsx`,
  cada card da esteira em `producao/[sectorId]/page.tsx`, cada grupo de
  modificador em `modifiers-section.tsx`. Isso é exatamente o que
  `design-system.md` pede para evitar ("toda nova variante deve... não
  duplicar componente existente"). Hoje é só verbosidade; o risco real
  aparece quando alguém precisar mudar o raio, a borda ou o padding do
  card padrão — vai ter que caçar e editar em ~8 arquivos.

- **[Baixo] `Card` não aceita variantes** (ex.: destaque/ênfase). A tela
  da Mesa (`SummaryField` em `mesas/[id]/page.tsx`) já tem uma variante
  local "emphasis" para o Saldo que não veio de `Card` — outro sintoma
  do mesmo problema acima, não um item novo.

## 6. Botões

`SubmitButton` (`src/components/form/submit-button.tsx`) é usado de
forma consistente em **todo** formulário do sistema — 3 variantes
(primary/outline/danger), estado `pending` automático via
`useFormStatus`, bloqueio de duplo clique embutido. Este é um dos pontos
mais sólidos do frontend atual.

- **[Alto] Não existe um componente `Button`/`LinkButton` para ações que
  não são submit de formulário** (links estilizados como botão,
  botões `type="button"` fora de form). O estilo primário
  (`bg-wine text-bg hover:bg-wine-dark`, `rounded-lg`, `px-4 py-2.5`) é
  reescrito manualmente como string de classes em pelo menos 4 lugares
  diferentes (`+ Novo pedido` em `pedidos/page.tsx`, `+ Nova mesa` em
  `admin/mesas/page.tsx`, "Adicionar ao pedido" em `new-order-form.tsx`,
  seletor de setor ativo em `producao/[sectorId]/page.tsx`) — cada um com
  pequenas variações de padding/tamanho que não são intencionais, são
  deriva de copiar-colar.

- **[Médio] Botões icon-only não têm componente nem padrão de tamanho
  mínimo.** O lápis de editar mesa (`table-card.tsx`) é `h-6 w-6` (24px)
  — abaixo até do menor tamanho definido em `design-system.md`
  ("compacto: 36px"). A seta de voltar em `mesas/[id]/layout.tsx` e
  `admin/layout.tsx` também são link cru sem área de toque garantida além
  do ícone. Em desktop com mouse não incomoda; em tablet (Caixa, CLAUDE.md
  §3) é um alvo pequeno para toque.

## 7. Ícones

Biblioteca única (`lucide-react`), conforme pedido em `design-system.md`
("escolher uma única biblioteca"). Uso consistente de `strokeWidth`
diferenciado para estado ativo/inativo em navegação. Sem problemas de
inventário — não há mistura com outra lib de ícone em lugar nenhum do
código.

- **[Médio] Ícones que carregam informação de status (não são só
  decorativos) não têm texto alternativo confiável.** O sininho de
  "pedido pronto" (`Bell` em `mesas/page.tsx` e `table-card.tsx`) usa
  `title="X item(ns) pronto(s)..."` como única forma de explicar o
  número ao lado do ícone — `title` não aparece em toque (mobile) e é
  lido de forma inconsistente por leitores de tela. Visualmente está
  correto (não depende só de cor, tem número), mas o contexto completo
  ("prontos para entrega") só chega a quem usa mouse com paciência para
  esperar o tooltip.

## 8. Formulários

`TextField`/`TextAreaField`/`SelectField`/`CheckboxField`
(`src/components/form/field.tsx`) — label associado via `useId()` (bug
de acessibilidade real já corrigido no Módulo 2, ver `docs/backlog.md`),
altura de toque de 44px (`h-11`), foco visível herdado do `globals.css`.
Uso consistente na grande maioria dos formulários do sistema.

- **[Médio] Alguns formulários usam `<input>` cru em vez do campo
  compartilhado.** `cancel-item-form.tsx` (campo "Motivo" do
  cancelamento) e os nomes de pessoa dinâmicos em `open-table-form.tsx`
  reimplementam a mesma classe de input em vez de usar `TextField` —
  visualmente idêntico hoje (a classe foi copiada), mas sem label
  associado por `useId()` num dos dois casos (o de motivo não tem
  `<label>` nenhum, só `placeholder`, que não é suficiente para
  acessibilidade) e duplica a manutenção da classe de estilo.

- **[Baixo] `modifiers-section.tsx` é visualmente denso** — cada
  adicional é um mini-formulário completo dentro de uma célula de
  tabela, com "Salvar" próprio por linha. Funciona, mas em um produto
  com muitos adicionais (ex.: grupo "Ponto da carne" + "Molhos" + several
  extras) a tela fica repetitiva e cansativa de escanear.

## 9. Modais

- **[Crítico] Não existe nenhum componente de modal/diálogo no sistema
  (`Dialog`, `Drawer` — ambos listados como prioritários em
  `design-system.md` — não foram criados).** Isso por si só não é grave;
  o problema é a consequência: **ações com efeito real e imediato não
  têm nenhuma confirmação além de, no máximo, um campo de texto
  obrigatório.**
  - "Gerar novo token" do agente de impressão
    (`regenerate-token-form.tsx`) invalida o token anterior
    **imediatamente** ao clicar — se clicado sem querer, a impressão real
    para de funcionar até alguém atualizar o `.env` do agente com o novo
    token. Hoje isso acontece com um único clique em um botão outline,
    sem "tem certeza?".
  - Alternar disponibilidade de produto (`toggleAvailability` em
    `admin/produtos/page.tsx`) também é um clique único — este caso é
    aceitável (reversível com outro clique, baixo risco), mas ilustra que
    o sistema não tem hoje nenhum padrão de "confirmar antes de agir"
    para diferenciar os dois casos.
  - Cancelamento de item **tem** fricção proposital (campo de motivo
    obrigatório) — esse fluxo está OK e não precisa de modal.

## 10. Responsividade

- App do garçom (`(staff)/*`): mobile-first de verdade — grid 2 colunas
  em telas pequenas, bottom nav, campos com `h-11`/`h-12`, sem tabela
  larga em nenhuma tela do garçom. Bom.
- Admin: desktop-first por decisão de produto documentada
  (`admin/layout.tsx`), com sidebar virando barra horizontal com scroll
  em telas estreitas.

- **[Alto] Listagens administrativas usam `<table>` HTML larga com
  scroll horizontal (`overflow-x-auto`), contrariando a diretriz
  explícita "evitar tabelas largas"** (CLAUDE.md §11 e checklist da
  skill). Confirmado em `admin/produtos/page.tsx` (6 colunas) e
  `admin/impressoras/page.tsx` (5 colunas) — prováveis também em
  Categorias/Setores (mesmo padrão de `src/components/ui/table.tsx`).
  Em desktop isso é invisível; em tablet (CLAUDE.md §3: "caixa" usa
  tablet) a tabela de produtos com 6 colunas provavelmente já precisa de
  scroll horizontal, que é exatamente o padrão que o próprio projeto diz
  para evitar.

## 11. Experiência no celular

- Bottom nav alcançável com o polegar, cards de mesa com toque de área
  generosa, formulário de novo pedido com campos grandes — alinhado ao
  "uma mão" do CLAUDE.md §11.
- Idempotência real (chave por sessão de formulário) + `SubmitButton`
  desabilitado durante `pending` cobrem "bloquear múltiplos envios" e
  "evitar pedido duplicado" — ponto forte, já validado por teste de
  integração (ver Módulo 4/7 no backlog).

- **[Médio] Nenhuma tela de novo pedido isola uma etapa de "revisão antes
  de enviar" separada.** O carrinho fica visível abaixo do formulário de
  adicionar item, o que funciona, mas em uma tela pequena o botão
  "Enviar pedido" fica no fim de uma rolagem longa (formulário de
  adicionar + lista completa do carrinho) — quanto mais itens no
  carrinho, mais rolagem até o botão de enviar.

## 12. Estados de loading, vazio e erro

- Estados vazios existem em toda lista (`"Nenhum X ainda"`), sempre como
  texto simples — nunca quebra a tela, mas nunca orienta a próxima ação
  além de um link ocasional (ex.: "Cadastrar mesas").
- Erros de submissão de formulário são exibidos de forma consistente
  (`role="alert"`, texto vermelho `text-wine`, abaixo do botão) em
  **todo** formulário do sistema — bom padrão, replicado sem exceção.

- **[Crítico] Não existe nenhum arquivo `loading.tsx`, `error.tsx` ou
  `not-found.tsx` em nenhuma rota do App Router.** Confirmado por busca
  exaustiva em `src/app/**`. Consequência prática:
  - Nenhuma navegação entre páginas mostra indicador de carregamento —
    numa rede instável (CLAUDE.md §3: "suportar internet local
    instável" é requisito explícito), o usuário toca num link e não vê
    nenhum feedback até o React Server Component terminar de buscar
    dados; a tela anterior fica parada, sem indício de que algo está
    acontecendo.
  - Qualquer erro não tratado durante a renderização de uma Server
    Component (ex.: falha de conexão com o banco no meio de uma consulta)
    cai no comportamento padrão do Next.js — em produção, uma tela de
    erro genérica sem a identidade visual do sistema nem orientação do
    que fazer.
  - Rotas inexistentes (`/mesas/id-invalido`, por exemplo) não têm 404
    customizado — ver também item de acessibilidade abaixo, onde
    `getTableWithActiveSession` provavelmente lança e cai no mesmo
    comportamento padrão.

- **[Alto] Feedback de sucesso é sempre implícito (redirecionamento ou
  atualização de lista), nunca uma confirmação textual explícita.**
  CLAUDE.md §11 pede "exibir feedback de sucesso **ou** erro" — o lado
  do erro está bem coberto (`role="alert"` em todo formulário); o lado
  do sucesso não existe como conceito no sistema hoje (sem `Toast`,
  listado como componente prioritário em `design-system.md` e nunca
  criado). Exemplo concreto: enviar um pedido redireciona para
  `/pedidos`, onde o pedido novo aparece na lista — funciona, mas não há
  nenhuma mensagem "Pedido enviado" confirmando explicitamente a ação
  que acabou de acontecer. Em conexão lenta, o redirecionamento em si
  pode demorar o suficiente para o garçom achar que nada aconteceu e
  tocar em enviar de novo (mitigado pela idempotência no backend, mas
  não pela UI).

- **[Médio] Nenhum estado de "carregando" dentro de página para dados
  assíncronos que não sejam submissão de formulário.** Como todas as
  telas são Server Components buscando dados antes de renderizar, hoje
  isso se manifesta como "página em branco até tudo carregar" em vez de
  skeleton — consequência direta da ausência de `loading.tsx` (item
  crítico acima), listado à parte porque a correção é a mesma, mas o
  sintoma (tela em branco vs. tela de erro) é diferente.

## 13. Acessibilidade

- Foco visível global (`:focus-visible` com `ring-2 ring-gold`) aplicado
  a todo elemento interativo via `globals.css` — ótima base, cobre
  qualquer componente novo automaticamente.
- Labels associados via `useId()` em todos os campos do `form/field.tsx`
  — bug real de colisão de `id` já corrigido no Módulo 2.
  Status nunca depende só de cor (badge sempre tem texto).
- `DonutChart` usa `role="img"` + `aria-label` descritivo, e cada
  segmento tem `<title>` — bom exemplo a replicar.

- **[Médio] Alvos de toque abaixo de 36px em pelo menos um controle
  interativo real** (botão de editar mesa, 24px — ver item 6, Botões).
- **[Médio] Informação transmitida só por `title` (hover)** em pelo
  menos dois lugares (sininho de pedido pronto — ver item 7, Ícones).
- **[Baixo] Sem link "pular para o conteúdo" (skip link)** em nenhum
  layout — replicável de forma barata quando o padrão de página crescer.
- **[Baixo] Nenhum teste automatizado de acessibilidade** (ex.:
  `axe-core`) na suíte E2E existente — hoje a cobertura é só funcional.

## 14. Consistência entre páginas

Resumo dos achados já detalhados acima, reunidos aqui porque são a causa
raiz comum de várias das telas divergirem sutilmente:

1. `Card` (item 5) e a ausência de `Button`/`LinkButton` (item 6) fazem
   com que a mesma decisão visual (cantos, borda, sombra, padding de
   card; cor e altura de botão primário) seja tomada de novo, à mão, em
   cada arquivo — hoje ainda coerente porque foi tudo copiado da mesma
   fonte original, mas sem trava nenhuma contra divergir aos poucos.
2. `PageHeader` (item 4) usado em ~60% das telas, não em todas.
3. Padrão de estado vazio ("Nenhum X ainda") é textualmente consistente,
   mas nunca é um componente — é uma string reescrita em cada tela.

---

## Resumo por severidade

| Severidade | Quantidade | Itens |
|---|---|---|
| Crítico | 2 | Ausência de `loading.tsx`/`error.tsx`/`not-found.tsx`; ações irreversíveis sem confirmação (token de impressora) |
| Alto | 5 | `Card` subutilizado; `Button`/`LinkButton` inexistente; componentes prioritários do design system nunca criados; feedback de sucesso sempre implícito; tabelas admin largas em telas estreitas |
| Médio | 8 | Doc do design system desatualizado (tema); `PageHeader` inconsistente; botões icon-only sem alvo mínimo; ícone de status só com `title`; `<input>` cru em 2 formulários; carrinho sem etapa de revisão isolada; sem skeleton de carregamento in-page; alvos de toque pequenos (a11y) |
| Baixo | 7 | Divergência de densidade `/mesas` vs `/admin/mesas`; nav admin incompleta (módulos futuros); `modifiers-section` denso; sem link de recuperação de senha; sem skip link; sem teste automatizado de a11y; `formatBRLNumber` duplicado (motivo válido) |

Nenhum problema encontrado nesta auditoria envolve regra de negócio,
cálculo financeiro ou permissão — são todos de camada de apresentação,
como esperado pelo escopo da skill `frontend-modernization`.

Plano de correção incremental: ver `docs/design/modernization-plan.md`.
