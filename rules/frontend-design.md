# Frontend e UX — MITIZ Mesas

Estas regras se aplicam a qualquer criação ou alteração de interface, componente, página, layout, fluxo visual ou experiência de uso do MITIZ Mesas.

## Objetivo

Construir uma aplicação operacional moderna, elegante, rápida e intuitiva, com aparência de produto SaaS atual, sem comprometer velocidade, clareza ou facilidade de uso.

O usuário principal é o funcionário da MITIZ durante o atendimento. A interface deve reduzir toques, dúvidas e erros.

## Princípios obrigatórios

1. Mobile first, sem degradar desktop.
2. Hierarquia visual clara.
3. Uma ação principal evidente por contexto.
4. Estados do sistema sempre visíveis.
5. Feedback imediato após qualquer ação.
6. Componentes consistentes em todas as telas.
7. Acessibilidade e contraste adequados.
8. Evitar excesso de informação simultânea.
9. Não usar efeitos visuais apenas decorativos.
10. Não copiar interfaces antigas ou padrões de sistemas desktop legados.

## Direção visual

A identidade deve transmitir operação profissional, steakhouse premium, tecnologia atual, agilidade e confiança.

Paleta de referência:
- fundo principal em grafite muito escuro;
- superfícies em preto suave e cinza carvão;
- vermelho MITIZ para ações e identidade;
- dourado ou bege apenas como detalhe premium;
- verde para sucesso e mesa livre;
- âmbar para atenção;
- vermelho para erro ou cancelamento;
- branco e cinzas claros para textos.

Evitar preto absoluto em todas as superfícies, muitas bordas coloridas, gradientes exagerados, brilho neon, sombras pesadas, excesso de cores, ícones inconsistentes e botões sem hierarquia.

## Tipografia

- Usar fonte sem serifa moderna e legível.
- Manter escala tipográfica consistente.
- Valores financeiros e números de mesa devem ter alta legibilidade.
- Nunca usar texto muito pequeno em ações operacionais.
- Evitar caixa alta em blocos longos.

## Espaçamento

Usar escala consistente: 4, 8, 12, 16, 20, 24, 32, 40 e 48 px.

## Ícones

- Usar uma única biblioteca.
- Preferir Lucide, Phosphor ou a biblioteca já adotada.
- Não misturar estilos sem regra.
- Ícones isolados precisam de tooltip ou rótulo quando não forem universais.
- Não usar emoji como ícone de interface.

## Botões

Hierarquia: primário, secundário, terciário/ghost e destrutivo.

- Todo botão deve ter estados normal, hover, foco, ativo, carregando e desabilitado.
- Não usar mais de um botão primário concorrente no mesmo bloco.
- Botões somente com ícone precisam de nome acessível e tooltip.
- Ações destrutivas exigem confirmação proporcional ao risco.
- No mobile, usar área de toque confortável.

## Formulários

- Rótulos sempre visíveis.
- Mensagens de erro devem explicar como corrigir.
- Manter valores digitados após erro.
- Usar campos adequados para número, dinheiro, data e quantidade.
- Botão de salvar deve impedir duplo envio.
- Não usar modal longo para formulário complexo.

## Cards de mesa

Cada mesa deve comunicar rapidamente:
- número ou nome;
- status;
- pessoas;
- tempo aberta;
- valor parcial;
- garçom;
- pedidos pendentes ou prontos;
- pagamento parcial.

A cor não pode ser o único indicador de status.

Ações:
- livre: Abrir mesa;
- ocupada: abrir detalhes ao tocar;
- aguardando fechamento: Fechar conta em destaque;
- pedido pronto: alerta perceptível sem animação excessiva.

## Navegação

Desktop:
- sidebar clara e recolhível;
- página atual destacada.

Mobile:
- barra inferior ou menu compacto;
- evitar sidebar desktop comprimida;
- manter acesso rápido a Mesas, Pedidos e Conta;
- preservar o contexto ao voltar.

## Estados obrigatórios

Toda tela de dados deve considerar:
- carregando;
- vazio;
- sucesso;
- erro;
- sem conexão;
- permissão negada;
- atualização em andamento.

Nunca mostrar apenas spinner indefinido. Estados vazios devem orientar a próxima ação.

## Feedback

- Toast somente para confirmações breves.
- Erros importantes permanecem no contexto.
- Pedido enviado gera confirmação inequívoca.
- Falha de impressão aparece como alerta acionável.
- Não esconder falhas apenas no console.

## Tempo real

Atualizações não devem mover elementos inesperadamente, apagar digitação, fechar modais ou sobrescrever alterações sem aviso.

## Acessibilidade

- Contraste adequado.
- Foco visível.
- Navegação por teclado no desktop.
- Áreas de toque de aproximadamente 44 px.
- Não depender só de cor.
- Respeitar redução de movimento.

## Responsividade

Testar celular pequeno, celular comum, tablet, notebook e desktop. Nenhuma tela deve depender de largura fixa.

## Componentização

Antes de criar componente novo:
1. procurar equivalente;
2. verificar tokens e variantes;
3. reutilizar padrões;
4. criar nova abstração somente com necessidade real.

Componentes esperados:
Button, IconButton, Input, Select, Checkbox, Radio, Badge, StatusBadge, Card, Dialog, Drawer, Toast, EmptyState, ErrorState, LoadingState, Skeleton, PageHeader, SearchField, FilterBar, MoneyDisplay e TableStatusCard.

## Tokens

Centralizar cores, espaçamentos, raios, sombras, tipografia, alturas, z-index, breakpoints e transições. Não espalhar cores hexadecimais ou medidas arbitrárias pelo código.

## Movimento

Usar animações curtas e funcionais, preferencialmente entre 120 e 220 ms. Não animar tudo e respeitar prefers-reduced-motion.

## Qualidade

Para qualquer alteração visual:
1. inspecionar componentes;
2. preservar regras de negócio;
3. evitar reescrita desnecessária;
4. atualizar testes;
5. verificar acessibilidade;
6. testar responsividade;
7. rodar lint, typecheck, testes e build;
8. comparar antes e depois.

## Critério de aceite

Uma tela só está pronta quando:
- a ação principal é óbvia;
- o estado atual está claro;
- funciona bem no celular;
- componentes são consistentes;
- todos os estados foram considerados;
- não há overflow;
- o fluxo usa o menor número razoável de etapas;
- o resultado parece parte do mesmo produto.

Em conflito entre estética e operação, priorizar:
1. clareza;
2. prevenção de erros;
3. velocidade;
4. acessibilidade;
5. consistência;
6. estética.
