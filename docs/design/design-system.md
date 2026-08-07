# Design System — MITIZ Mesas

## Personalidade

Premium sem exagero, operacional sem aparência burocrática, moderno sem experimentalismo, rápido e confiável.

## Paleta semântica

**Nota (atualizado após a implementação real — a primeira versão deste
documento descrevia um tema escuro que nunca foi para produção):** a
superfície de trabalho é **clara** — bege quente (`bg` `#F2ECE6`) com
texto quase-preto (`ink` `#1A1A1A`) — priorizando leitura rápida em
ambiente de restaurante. O grafite/preto (`shell` `#1A1A1A`,
`shell-line` `#3F3F3F`) existe só como âncora de contraste na navegação
(barra inferior do garçom, sidebar do admin), nunca no conteúdo. Ver
comentário completo em `tailwind.config.ts`.

Tokens reais (`tailwind.config.ts`):
- `bg` `#F2ECE6` / `surface` `#FFFFFF`: fundo de trabalho / cartões;
- `ink` `#1A1A1A` / `muted` `#494949`: texto primário / secundário;
- `line` `#DAD4CF`: bordas de baixo contraste;
- `shell` `#1A1A1A` / `shell-line` `#3F3F3F`: só navegação;
- `wine` (`#AF2B1E`, + `light`/`dark`): ação primária, marca — também
  cobre erro/perigo (`Button`/`SubmitButton` variant `danger`), porque a
  paleta oficial da marca tem só 5 cores travadas e não inventamos hex
  novo só para "cor de erro" separada;
- `gold` (`#B58B57`, + `light`/`dark`): destaque, valores monetários,
  estado de atenção/aguardando;
- `free` (`#3F7D57`, + `light`/`dark`): única exceção fora da paleta de
  marca — verde/sucesso/mesa livre, convenção universal de mapa de mesas,
  documentada como tal no próprio `tailwind.config.ts`.

Não usar a cor de marca (`wine`) como identidade de ação primária E
destrutiva ao mesmo tempo na mesma tela — nas telas atuais isso nunca
colide (perigo é sempre outline, primário é sempre preenchido), mas vale
atenção ao criar telas novas.

## Espaçamento

4, 8, 12, 16, 20, 24, 32, 40, 48.

## Raios

- control-sm: 8 px;
- control: 10 px;
- card: 14 px;
- panel: 16 px;
- pill: 999 px somente para badges.

## Controles

Alturas:
- compacto: 36 px;
- padrão: 44 px;
- grande: 48–52 px.

## Componentes prioritários

Implementados (`src/components/ui/` e `src/components/form/`): Button,
IconButton, Input (+ `TextField`/`SelectField`/`TextAreaField`/
`CheckboxField`), StatusBadge, Card, PageHeader, BottomNavigation
(`(staff)/bottom-nav.tsx`), Sidebar (`admin/sidebar-nav.tsx`),
ConfirmDialog (diálogo de confirmação — cobre o papel do "Dialog" desta
lista), Toast, EmptyState, Skeleton (usado em `loading.tsx` de cada
rota).

Ainda não implementados (sem caso de uso real que os justifique até
agora — CLAUDE.md "toda nova variante deve resolver necessidade real"):
Select (como componente separado de `SelectField`), TableStatusCard
(hoje cada listagem tem seu próprio card, ver `table-card.tsx`),
Drawer, ErrorState (hoje cada `error.tsx` de rota resolve isso
diretamente), MoneyDisplay, QuantityStepper, OrderItemRow,
PaymentSummary (os três últimos esperam o Módulo 8 — Caixa e
pagamentos).

## Card de mesa

Conteúdo:
- status;
- número;
- pessoas;
- tempo;
- valor;
- garçom;
- alerta;
- ação contextual.

Variantes:
- free;
- occupied;
- waiting-closing;
- partially-paid;
- order-ready;
- blocked.

## Ícones

Biblioteca única: `lucide-react`. Já em uso em todo o projeto — não
introduzir uma segunda biblioteca.

## Conteúdo

Textos diretos:
- Abrir mesa
- Novo pedido
- Enviar pedido
- Solicitar fechamento
- Registrar pagamento
- Concluir atendimento
- Tentar novamente

Evitar “OK”, “Prosseguir” e “Clique aqui” sem contexto.

## Evolução

Toda nova variante deve resolver necessidade real, reutilizar tokens, ser documentada e não duplicar componente existente.
