# Plano de Modernização Incremental — Frontend MITIZ Mesas

Baseado em `docs/design/frontend-audit.md`. Segue o formato pedido pela
skill `frontend-modernization` (problemas → objetivo → mudanças →
componentes → arquivos → riscos → testes), dividido em fases pequenas e
independentes. **Nenhuma fase deste plano foi implementada ainda.**

## Princípios que valem para todas as fases

- Nenhuma regra de negócio, cálculo financeiro, permissão ou fluxo de
  dados muda — só camada de apresentação.
- Cada fase entrega o sistema executável ao final (CLAUDE.md §16), com
  lint, typecheck, testes e build passando antes de considerar concluída.
- Preferir extrair um componente já usado em 2+ lugares em vez de
  inventar um sistema novo — os "componentes prioritários" do
  `design-system.md` nascem quando o segundo caso de uso real aparece,
  não antes.
- Nenhum texto/label coberto por E2E existente (`tests/e2e/*.spec.ts`)
  pode mudar sem atualizar o teste correspondente — checklist obrigatório
  antes de cada fase que toca HTML visível.
- Sem dependência nova sem justificar (CLAUDE.md §17) — todas as fases
  abaixo são resolvíveis com React/Tailwind puro, sem biblioteca de UI
  externa.

---

## Fase 1 — Rede de segurança: loading, erro e 404 (Crítico)

### Problemas encontrados
Nenhuma rota tem `loading.tsx`, `error.tsx` ou `not-found.tsx`. Navegação
sem feedback visual em conexão lenta; erro de renderização cai no
comportamento padrão do Next.js sem identidade visual; sem 404
customizado.

### Objetivo
Toda navegação principal mostra um indicador de carregamento visível em
menos de ~300ms de espera; todo erro de renderização mostra uma tela com
a identidade do sistema e uma ação de recuperação; rota inexistente
mostra 404 consistente com o resto do app.

### Mudanças propostas
- `loading.tsx` no nível de `(staff)` e de `admin` (skeleton simples —
  ver componente novo abaixo), cobrindo as sub-rotas que não tiverem um
  próprio.
- `loading.tsx` específico para `/mesas` (grid) e `/admin/mesas`
  (painel), onde um skeleton "no formato certo" evita salto de layout.
- `error.tsx` no nível raiz de `(staff)` e `admin` — mensagem no tom do
  sistema ("Não foi possível carregar esta página"), botão "Tentar de
  novo" (reset do error boundary) e link para `/mesas` ou `/admin`.
- `not-found.tsx` reaproveitando o layout de `src/app/sem-permissao/page.tsx`
  como referência visual (ícone + título + texto curto + link de volta).

### Componentes reutilizados
`MitizMark`, tokens de cor existentes, mesmo padrão de texto de
`sem-permissao/page.tsx`.

### Componentes novos necessários
- `Skeleton` (`src/components/ui/skeleton.tsx`) — bloco simples com
  animação `pulse` via Tailwind, usado dentro dos `loading.tsx`.

### Arquivos previstos
- `src/app/(staff)/loading.tsx`, `error.tsx`
- `src/app/(staff)/mesas/loading.tsx`
- `src/app/admin/loading.tsx`, `error.tsx`
- `src/app/admin/mesas/loading.tsx`
- `src/app/not-found.tsx`
- `src/components/ui/skeleton.tsx` (novo)

### Riscos de regressão
Baixo — arquivos novos, não tocam em código existente. Único cuidado:
`error.tsx` precisa ser Client Component (exigência do Next.js) e não
pode importar nada que dependa de `server-only`.

### Testes necessários
- Verificação manual: forçar erro (ex.: lançar exceção temporária numa
  page) e confirmar que `error.tsx` aparece em vez da tela padrão do
  Next.js; navegar para rota inexistente e confirmar `not-found.tsx`.
- `tsc --noEmit`, lint, build.
- Sem novo teste E2E obrigatório (não é fluxo de negócio), mas se houver
  tempo, um teste simples de "rota inexistente mostra 404 customizado"
  é barato e útil.

---

## Fase 2 — Confirmação de ações irreversíveis (Crítico)

### Problemas encontrados
Nenhum componente de modal/diálogo existe. Regenerar o token do agente de
impressão invalida o token anterior imediatamente, sem nenhuma
confirmação — um clique acidental interrompe a impressão real até
alguém atualizar o `.env` do agente.

### Objetivo
Toda ação que quebra algo em produção imediatamente (hoje: regenerar
token de impressora) exige uma confirmação explícita antes de executar.

### Mudanças propostas
- Criar `ConfirmDialog` (modal simples, `<dialog>` nativo do HTML ou
  implementação com `role="alertdialog"` — decisão técnica na
  implementação, sem biblioteca nova) com título, descrição e dois
  botões (cancelar / confirmar).
- Aplicar em `RegenerateTokenForm` — clique em "Gerar novo token" abre o
  diálogo explicando a consequência ("Isso invalida o token atual
  imediatamente — o agente vai parar de puxar a fila até você atualizar
  o `.env` dele.") antes de submeter.
- **Não** aplicar em `toggleAvailability` (produto) — ação reversível e
  de baixo risco, confirmação seria fricção desnecessária (evitar excesso
  de modal, CLAUDE.md §11 "evitar modais longos" — este deve ser curto
  quando existir).

### Componentes reutilizados
`SubmitButton`, tokens de cor (`wine` para ação destrutiva).

### Componentes novos necessários
- `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) — reutilizável
  para qualquer confirmação futura (ex.: fechamento de mesa no Módulo 8,
  que provavelmente vai precisar do mesmo padrão).

### Arquivos previstos
- `src/components/ui/confirm-dialog.tsx` (novo)
- `src/app/admin/impressoras/[id]/editar/regenerate-token-form.tsx`
  (usa o novo componente)

### Riscos de regressão
Médio-baixo — `regenerate-token-form.tsx` já é testado só manualmente
(sem E2E hoje); mudança de fluxo (clique → modal → confirmar → submit)
precisa ser testada manualmente de ponta a ponta antes de considerar
pronto, com atenção a foco de teclado (o diálogo precisa capturar foco e
devolver ao botão que abriu ao fechar).

### Testes necessários
- Manual: abrir diálogo, cancelar (token não muda), confirmar (token
  muda como hoje).
- Teclado: `Tab` não escapa do diálogo aberto, `Esc` fecha.
- `tsc --noEmit`, lint, build.

---

## Fase 3 — Consolidar duplicação: Card, Button/LinkButton, EmptyState (Alto)

### Problemas encontrados
`Card` existe mas é ignorado na maioria das telas (marcação repetida à
mão em ~8 arquivos). Não existe `Button`/`LinkButton` para ações fora de
formulário — estilo primário reescrito manualmente em 4+ lugares. Estado
vazio ("Nenhum X ainda") é uma string repetida em cada lista, nunca um
componente.

### Objetivo
Uma única fonte de verdade para "como é um card", "como é um botão de
ação" e "como é uma lista vazia" — mudar o visual desses três elementos
no futuro deve significar editar um arquivo, não caçar oito.

### Mudanças propostas
- Substituir toda ocorrência de `rounded-card border border-line
  bg-surface p-{3,4}` manual por `<Card>`, adicionando as poucas
  variantes que faltam (`padding` configurável, já que hoje há mistura de
  `p-3` e `p-4`).
- Criar `LinkButton` (mesmo visual do `SubmitButton` variant="primary",
  mas como `<Link>`) e usá-lo em "+ Novo pedido", "+ Nova mesa",
  "Adicionar ao pedido" (este é `<button type="button">`, não link —
  avaliar se cabe no mesmo componente ou se precisa de uma variante
  `type="button"` do próprio `SubmitButton`/um `Button` genérico
  compartilhado por ambos).
- Criar `EmptyState` (ícone opcional + texto + ação opcional) e substituir
  os `<p className="text-sm text-muted">Nenhum X ainda</p>` espalhados
  pelo sistema.

### Componentes reutilizados
`SubmitButton` como base de estilo para o novo `Button`/`LinkButton`
(mesmo mapa de `VARIANTS`, para não divergir cor/altura entre os dois).

### Componentes novos necessários
- `Button` ou `LinkButton` (`src/components/ui/button.tsx`) — decisão de
  implementação: um componente que aceita `as="button" | "link"`, ou dois
  componentes pequenos compartilhando o mesmo mapa de `VARIANTS` já
  existente em `submit-button.tsx` (extraído para um módulo comum).
- `EmptyState` (`src/components/ui/empty-state.tsx`).

### Arquivos previstos (edição, não criação, além dos dois acima)
`pedidos/page.tsx`, `new-order-form.tsx`, `impressao/page.tsx`,
`historico/page.tsx`, `producao/[sectorId]/page.tsx`,
`modifiers-section.tsx`, `admin/mesas/page.tsx`, `mesas/page.tsx` (grid
do garçom) — cada um trocando marcação repetida pelos componentes novos,
um arquivo por vez, sem misturar com mudança de comportamento.

### Riscos de regressão
Médio — mudança tocando muitas telas ao mesmo tempo é exatamente o tipo
de risco que CLAUDE.md §17 pede para evitar ("não fazer refatorações
amplas durante uma correção pequena"). Por isso esta fase deve ser
dividida em commits pequenos por tela/componente, cada um validável
isoladamente, não um único commit trocando tudo.

### Testes necessários
- Rodar a suíte E2E completa (`tests/e2e/*.spec.ts`) após cada tela
  migrada — checklist de string protegida (mesmo processo já usado na
  repaginação visual original, ver `docs/backlog.md`).
- Comparação visual manual (screenshot antes/depois) de cada tela tocada.
- `tsc --noEmit`, lint, build.

---

## Fase 4 — Feedback de sucesso explícito (Alto)

### Problemas encontrados
Nenhuma ação bem-sucedida (enviar pedido, cancelar item, adicionar
pessoa, criar cadastro admin) produz uma confirmação textual explícita —
só redirecionamento ou atualização de lista.

### Objetivo
Toda ação relevante confirma explicitamente o que aconteceu, no
vocabulário definido em `design-system.md` ("Pedido enviado", não "OK").

### Mudanças propostas
- Criar `Toast` simples (client component, contexto React ou
  `useState` + `setTimeout` no layout raiz — sem biblioteca nova) que
  aparece após ações de sucesso e some sozinho.
- Aplicar primeiro nos dois fluxos de maior frequência de uso real:
  enviar pedido (`createOrderAction`) e cancelar item — os dois já
  redirecionam/revalidam, então o toast é aditivo, não substitui o
  redirecionamento atual.
- Adiar aplicar em todo formulário do admin até esta fase provar que o
  padrão funciona bem nos dois fluxos de maior tráfego (evitar over
  engineering em cadastro de baixa frequência).

### Componentes reutilizados
Tokens de cor (`free`/`gold`/`wine` conforme o tipo de mensagem).

### Componentes novos necessários
- `Toast` + `ToastProvider` (`src/components/ui/toast.tsx`) — provider
  no layout raiz (`src/app/layout.tsx`), hook `useToast()` para disparar.

### Arquivos previstos
- `src/components/ui/toast.tsx` (novo)
- `src/app/layout.tsx` (adiciona `ToastProvider`)
- `src/app/(staff)/mesas/[id]/pedidos/actions.ts` (dispara toast de
  sucesso — precisa de solução client-side, já que server actions não
  podem chamar o hook diretamente; provável padrão: `useActionState` já
  usado hoje devolve um estado que o form component client observa e
  dispara o toast em `useEffect`)
- `new-order-form.tsx`, `cancel-item-form.tsx` (client components que já
  chamam a action, disparam o toast a partir do novo estado de sucesso)

### Riscos de regressão
Baixo-médio — mexe em fluxo já coberto por E2E (`pedidos.spec.ts`).
Precisa confirmar que o toast não atrapalha nem atrasa o redirecionamento
que os testes esperam.

### Testes necessários
- Rodar `tests/e2e/pedidos.spec.ts` completo.
- Manual: toast aparece, some sozinho, não bloqueia interação com o
  resto da tela, funciona em conexão lenta (não trava esperando o
  redirecionamento).
- `tsc --noEmit`, lint, build.

---

## Fase 5 — Tabelas admin responsivas (Alto)

**Status: aplicada só em `admin/produtos`.** Ao implementar, achamos um risco
concreto de quebrar `tests/e2e/admin.spec.ts`: as asserções de
Categorias/Setores/Mesas usam `page.getByText(nome)` **sem escopo** — um
texto duplicado num `<CardList>` escondido (`md:hidden`) ainda existe no
DOM e quebra essa asserção por match múltiplo, mesmo o card estando
invisível. Só o fluxo de Produtos usa `page.locator("tr", {hasText})`
(escopado), por isso é o único seguro para essa técnica sem antes
atualizar os testes. Replicar para Categorias/Setores/Impressoras fica
como pendência explícita, condicionada a ajustar os seletores desses
testes para um padrão escopado primeiro.

### Problemas encontrados
Listagens administrativas (Produtos, Impressoras, provavelmente
Categorias/Setores) usam `<table>` larga com scroll horizontal —
contraria a diretriz "evitar tabelas largas", relevante porque o Caixa
usa tablet (CLAUDE.md §3).

### Objetivo
As mesmas listagens ficam legíveis sem scroll horizontal em telas de
tablet (~768px), sem perder nenhuma coluna de informação.

### Mudanças propostas
- Abaixo de um breakpoint (`md`), trocar a tabela por uma lista de
  cards (um card por linha, label+valor empilhados) — mesmo padrão que
  `TableCard`/`Card` já estabelecem no resto do sistema.
- Acima do breakpoint, manter a tabela atual (funciona bem em desktop,
  não há motivo para descartar).
- Aplicar primeiro em `admin/produtos/page.tsx` (a listagem mais larga,
  6 colunas) como prova de conceito antes de replicar nas outras.

### Componentes reutilizados
`Card`, `Badge`, `SubmitButton`.

### Componentes novos necessários
- `ResponsiveTable` ou um par `Table`/`CardList` que os componentes de
  listagem escolhem conforme o breakpoint (via CSS `hidden md:block` /
  `md:hidden` nos dois containers, sem JS de detecção de viewport —
  mais simples e sem risco de flash de conteúdo errado).

### Arquivos previstos
- `src/components/ui/table.tsx` (adiciona ou acompanha um novo
  `CardListRow`/padrão irmão)
- `src/app/admin/produtos/page.tsx` (primeira aplicação)
- Depois, mesma técnica em `impressoras/page.tsx`,
  `categorias/page.tsx`, `setores/page.tsx`, `admin/mesas` (se aplicável
  — este já não é tabela, é grid de card, então provavelmente fica de
  fora)

### Riscos de regressão
Médio — `tests/e2e/admin.spec.ts` provavelmente usa seletores de tabela
(`<Tr>`/`<Td>` ou texto dentro delas); a versão em card por linha precisa
manter os mesmos textos/`data-testid` para não quebrar os testes, mesmo
mudando a estrutura do HTML ao redor.

### Testes necessários
- Rodar `tests/e2e/admin.spec.ts` completo, em ambas as larguras se o
  Playwright estiver configurado para mais de um viewport (senão, validar
  manualmente em tablet).
- Verificação manual em 768px (tablet) e em desktop.
- `tsc --noEmit`, lint, build.

---

## Fase 6 — Polimento de acessibilidade e detalhes finais (Médio/Baixo)

### Problemas encontrados
Alvos de toque abaixo de 36px em botões icon-only; informação de status
só em `title`; `<input>` cru em 2 formulários; sem skip link;
`design-system.md` desatualizado quanto ao tema de cor.

### Objetivo
Fechar os itens médios/baixos restantes da auditoria que não dependem de
nenhum componente novo grande — são ajustes pontuais.

### Mudanças propostas
- Aumentar a área de toque do botão de editar mesa (`table-card.tsx`)
  para pelo menos 36px (`h-9 w-9`), mantendo o ícone visualmente do
  mesmo tamanho com padding.
- Adicionar texto visualmente oculto (`sr-only`) junto ao badge de
  "pedido pronto", além do `title` existente, para leitores de tela.
- Trocar os `<input>` crus de `cancel-item-form.tsx` e
  `open-table-form.tsx` (nomes de pessoa) por `TextField`, com `label`
  visível ou `sr-only` conforme o espaço da tela permitir.
- Adicionar skip link ("Pular para o conteúdo") nos dois layouts raiz
  (`(staff)/layout.tsx`, `admin/layout.tsx`).
- Corrigir `docs/design/design-system.md` para descrever o tema real
  (claro, com `shell` escuro só na navegação) em vez do tema escuro
  original — puramente documentação, sem mudança de código.

### Componentes reutilizados
`TextField` já existente — sem componente novo nesta fase.

### Arquivos previstos
- `src/app/admin/mesas/table-card.tsx`
- `src/app/(staff)/mesas/page.tsx` (badge de pedido pronto)
- `src/app/(staff)/mesas/[id]/pedidos/cancel-item-form.tsx`
- `src/app/(staff)/mesas/[id]/open-table-form.tsx`
- `src/app/(staff)/layout.tsx`, `src/app/admin/layout.tsx`
- `docs/design/design-system.md` (só doc)

### Riscos de regressão
Baixo — mudanças pontuais e independentes entre si; podem ser feitas em
qualquer ordem ou até em paralelo por serem isoladas.

### Testes necessários
- Verificação de teclado (skip link funciona, tab order não muda).
- Rodar suíte E2E completa (por segurança — nenhum teste deveria
  depender destes detalhes, mas confirmar).
- `tsc --noEmit`, lint, build.

---

## Ordem recomendada e independência entre fases

```
Fase 1 (loading/error/404)         — sem dependência, pode começar já
Fase 2 (confirmação irreversível)  — sem dependência, pode ir em paralelo com a Fase 1
Fase 3 (Card/Button/EmptyState)    — sem dependência, mas é a mais trabalhosa (várias telas)
Fase 4 (Toast)                     — se beneficia do Button da Fase 3, mas não depende
Fase 5 (tabelas admin)             — se beneficia do Card da Fase 3, mas não depende
Fase 6 (polimento)                 — independente, pode ser feita a qualquer momento
```

Nenhuma fase bloqueia o Módulo 8 (Caixa e pagamentos) do backlog
principal — são trilhas paralelas. Dito isso, a Fase 2 (`ConfirmDialog`)
vale a pena terminar **antes** do Módulo 8 começar, porque fechamento de
conta com saldo/desconto é exatamente o tipo de ação que vai precisar do
mesmo padrão de confirmação.

## O que este plano deliberadamente não inclui

- Modo escuro / troca de tema — não pedido, e o `design-system.md`
  desatualizado (Fase 6) já resolve a única inconsistência real (doc
  vs. código), não uma funcionalidade nova.
- Qualquer redesenho visual amplo — a base já é consistente com a marca;
  este plano é sobre fechar lacunas e consolidar duplicação, não sobre
  mudar a direção visual.
- Telas/nav de módulos ainda não implementados (Pagamentos, Usuários,
  Auditoria) — ficam para quando o módulo de negócio correspondente for
  implementado, com o próprio módulo trazendo sua tela.
