# CLAUDE.md — MITIZ Mesas

## 1. Visão geral do projeto

O **MITIZ Mesas** é um sistema web responsivo para gerenciamento de mesas, comandas, pedidos, produção e fechamento de contas da MITIZ Boutique de Carnes.

O sistema será utilizado principalmente:

- Em celulares pelos garçons;
- Em computador ou tablet pelo caixa;
- Em computador, tablet ou impressora térmica na cozinha, parrilla e bar;
- Em tempo real por vários usuários simultaneamente.

A primeira versão não substituirá o PDV fiscal atual. Ela será um sistema operacional de atendimento e controle de comandas, preparado para uma integração futura com o PDV.

---

## 2. Objetivo principal

Permitir que a equipe da MITIZ consiga:

1. Abrir e gerenciar mesas;
2. Registrar a quantidade de pessoas;
3. Lançar comidas e bebidas;
4. Vincular itens à mesa ou a uma pessoa específica;
5. Enviar pedidos para cozinha, parrilla ou bar;
6. Imprimir pedidos automaticamente por setor;
7. Acompanhar o status dos pedidos;
8. Consultar o consumo parcial;
9. Dividir a conta;
10. Registrar pagamentos parciais ou completos;
11. Fechar a mesa;
12. Manter histórico e auditoria das operações.

---

## 3. Contexto operacional

- A MITIZ atende normalmente entre 6 e 8 mesas.
- O aplicativo deve permitir aumentar ou diminuir a quantidade de mesas.
- O atendimento pode ser controlado somente por mesa ou separado por pessoas.
- Uma mesa pode realizar vários pedidos durante o mesmo atendimento.
- Todos os pedidos devem permanecer vinculados ao mesmo atendimento.
- O sistema deve funcionar bem em celulares Android.
- A interface do garçom deve ser rápida, simples e utilizável com uma mão.
- O caixa precisa visualizar todas as mesas e alterações em tempo real.
- A operação não pode depender de atualização manual da página.
- O sistema deve suportar internet local instável e evitar pedidos duplicados.
- Valores monetários devem usar Real brasileiro: BRL / R$.
- Datas e horários devem usar o fuso `America/Sao_Paulo`.
- Idioma principal da interface: português do Brasil.

---

## 4. Escopo do MVP

### Incluído

- Autenticação;
- Perfis e permissões;
- Cadastro de usuários;
- Cadastro de mesas;
- Cadastro de categorias;
- Cadastro de produtos;
- Cadastro de adicionais e modificadores;
- Disponibilidade de produtos;
- Abertura de atendimento;
- Quantidade de pessoas;
- Identificação opcional das pessoas;
- Lançamento de pedidos;
- Observações por item;
- Escolha do ponto da carne;
- Separação do pedido por setor;
- Atualização em tempo real;
- Impressão de pedidos;
- Reimpressão;
- Cancelamento controlado;
- Resumo da comanda;
- Taxa de serviço;
- Descontos com permissão;
- Pagamentos parciais;
- Múltiplas formas de pagamento;
- Divisão por pessoa, item, valor ou igualmente;
- Fechamento da mesa;
- Histórico de atendimentos;
- Registro de auditoria.

### Fora do MVP

- Emissão de nota fiscal;
- Controle fiscal;
- Controle completo de estoque;
- Integração com maquininha;
- Integração com delivery;
- Aplicativo nativo;
- Programa de fidelidade;
- Reservas online;
- Cardápio para autoatendimento do cliente;
- Integração definitiva com o PDV;
- Contabilidade;
- Gestão financeira completa.

Não implementar itens fora do MVP sem solicitação explícita.

---

## 5. Perfis de usuário

### Administrador

Pode:

- Acessar todas as funções;
- Gerenciar usuários e permissões;
- Cadastrar e editar produtos;
- Configurar mesas, setores e impressoras;
- Aplicar descontos;
- Autorizar cancelamentos;
- Reabrir mesas;
- Visualizar relatórios e auditoria.

### Caixa

Pode:

- Visualizar todas as mesas;
- Conferir comandas;
- Registrar pagamentos;
- Dividir contas;
- Aplicar descontos dentro de sua permissão;
- Fechar mesas;
- Solicitar autorização para ações restritas;
- Reimprimir conferências e comprovantes.

### Garçom

Pode:

- Abrir mesas;
- Informar quantidade de pessoas;
- Adicionar pessoas à mesa;
- Criar e enviar pedidos;
- Consultar comandas;
- Solicitar cancelamento;
- Solicitar fechamento;
- Transferir itens ou mesas quando autorizado.

### Produção

Pode:

- Visualizar pedidos do seu setor;
- Marcar pedidos como recebidos;
- Marcar como em preparo;
- Marcar como prontos;
- Marcar como entregues;
- Reimprimir pedidos quando autorizado.

---

## 6. Setores de produção

O sistema deve permitir setores configuráveis.

Setores iniciais:

- Cozinha;
- Parrilla;
- Bar;
- Caixa;
- Sem impressão.

Cada produto deve possuir um destino padrão.

Um mesmo pedido pode gerar impressões diferentes para setores diferentes.

Exemplo:

- Bife ancho → Parrilla;
- Batata frita → Cozinha;
- Chope Pilsen → Bar;
- Água → Bar ou sem impressão.

---

## 7. Estados principais

### Mesa

- `FREE`: livre;
- `OCCUPIED`: ocupada;
- `WAITING_SERVICE`: aguardando atendimento;
- `ORDER_IN_PROGRESS`: pedido em andamento;
- `WAITING_CLOSING`: aguardando fechamento;
- `PARTIALLY_PAID`: pagamento parcial;
- `RESERVED`: reservada;
- `BLOCKED`: bloqueada.

### Atendimento

- `OPEN`;
- `WAITING_CLOSING`;
- `PARTIALLY_PAID`;
- `PAID`;
- `CLOSED`;
- `REOPENED`;
- `CANCELLED`.

### Pedido

- `DRAFT`;
- `SENT`;
- `RECEIVED`;
- `IN_PREPARATION`;
- `READY`;
- `DELIVERED`;
- `PARTIALLY_CANCELLED`;
- `CANCELLED`.

### Item do pedido

- `DRAFT`;
- `SENT`;
- `IN_PREPARATION`;
- `READY`;
- `DELIVERED`;
- `CANCELLATION_REQUESTED`;
- `CANCELLED`.

### Impressão

- `PENDING`;
- `PROCESSING`;
- `PRINTED`;
- `FAILED`;
- `CANCELLED`.

---

## 8. Regras de negócio obrigatórias

1. Uma mesa só pode ter um atendimento ativo por vez.
2. Uma mesa fechada não pode receber novos pedidos.
3. Um pedido em rascunho pode ser editado livremente.
4. Um pedido enviado não pode ser alterado silenciosamente.
5. Alterações após o envio devem gerar cancelamento, complemento ou novo item.
6. Todo cancelamento deve registrar usuário, data, hora e motivo.
7. Itens cancelados nunca devem ser apagados definitivamente.
8. Pagamentos nunca devem ser apagados definitivamente.
9. O preço do item deve ser congelado no momento do lançamento.
10. Alterar o preço do produto não pode modificar vendas anteriores.
11. A mesa só pode ser fechada quando o saldo for zero.
12. Pagamentos parciais devem reduzir o saldo da comanda.
13. Deve ser possível usar mais de uma forma de pagamento.
14. Descontos devem registrar tipo, valor, motivo e usuário responsável.
15. Taxa de serviço deve ser configurável e opcional no fechamento.
16. A retirada da taxa deve ficar registrada.
17. Operações financeiras devem ser transacionais.
18. Pedidos não podem ser duplicados por duplo toque ou repetição de requisição.
19. Toda requisição crítica deve aceitar chave de idempotência.
20. Valores monetários não devem usar ponto flutuante impreciso.
21. Usar decimal no banco ou valores inteiros em centavos.
22. O sistema deve registrar trilha de auditoria das ações críticas.
23. Horários devem ser armazenados de forma consistente e apresentados em `America/Sao_Paulo`.
24. O frontend nunca deve ser a única camada de validação.
25. Permissões devem ser verificadas no backend.

---

## 9. Fluxo principal do atendimento

### Abrir mesa

1. Selecionar mesa livre;
2. Informar quantidade de pessoas;
3. Informar responsável, opcional;
4. Informar nomes ou apelidos das pessoas, opcional;
5. Definir garçom responsável;
6. Confirmar abertura.

### Criar pedido

1. Entrar na mesa;
2. Selecionar “Novo pedido”;
3. Escolher categoria;
4. Escolher produto;
5. Informar quantidade;
6. Escolher pessoa ou consumo geral;
7. Selecionar modificadores;
8. Informar observações;
9. Revisar o pedido;
10. Enviar.

### Enviar para produção

1. Validar disponibilidade e preço;
2. Criar o pedido de forma transacional;
3. Separar os itens por setor;
4. Criar tarefas na fila de impressão;
5. Atualizar clientes conectados em tempo real;
6. Exibir confirmação clara ao garçom.

### Fechar mesa

1. Solicitar fechamento;
2. Conferir itens;
3. Aplicar taxa de serviço;
4. Aplicar desconto, se autorizado;
5. Escolher forma de divisão;
6. Registrar um ou mais pagamentos;
7. Validar saldo;
8. Finalizar atendimento;
9. Liberar mesa;
10. Manter histórico completo.

---

## 10. Telas do sistema

### Login

- E-mail ou usuário;
- Senha;
- Recuperação de acesso;
- Identificação da unidade no futuro.

### Visão de mesas

Cada card deve mostrar:

- Número ou nome;
- Status;
- Horário de abertura;
- Tempo de atendimento;
- Quantidade de pessoas;
- Garçom;
- Valor parcial;
- Alertas de pedidos prontos;
- Indicação de pagamento parcial.

### Tela da mesa

Cabeçalho:

- Número;
- Status;
- Horário de abertura;
- Tempo decorrido;
- Garçom;
- Pessoas;
- Subtotal;
- Taxa;
- Desconto;
- Total;
- Pago;
- Saldo.

Abas:

- Comanda;
- Pessoas;
- Pedidos;
- Pagamentos;
- Histórico.

Ações:

- Novo pedido;
- Adicionar pessoa;
- Transferir item;
- Transferir mesa;
- Juntar mesas;
- Solicitar fechamento;
- Imprimir conferência.

### Novo pedido

- Pesquisa;
- Categorias;
- Favoritos;
- Produtos;
- Quantidade;
- Pessoa;
- Modificadores;
- Ponto da carne;
- Observação;
- Resumo;
- Botão de envio.

### Produção

Colunas ou filtros:

- Novos;
- Em preparo;
- Prontos;
- Entregues.

### Caixa

- Mesas aguardando fechamento;
- Conferência;
- Divisão;
- Taxa;
- Desconto;
- Pagamentos;
- Saldo;
- Finalização.

### Administração

- Produtos;
- Categorias;
- Modificadores;
- Mesas;
- Setores;
- Impressoras;
- Usuários;
- Formas de pagamento;
- Configurações;
- Auditoria.

---

## 11. Experiência de uso

### Mobile first

- Priorizar celulares;
- Botões com área de toque adequada;
- Evitar tabelas largas;
- Usar barra inferior ou navegação simples;
- Manter ações principais acessíveis;
- Evitar modais longos;
- Não depender de hover;
- Mostrar estados de carregamento;
- Bloquear múltiplos envios;
- Exibir feedback de sucesso ou erro.

### Identidade visual

Usar a identidade da MITIZ:

- Visual premium e sóbrio;
- Vermelho escuro;
- Dourado ou bege;
- Preto, grafite, cinza e branco;
- Tipografia clara e legível;
- Evitar excesso de efeitos;
- Priorizar contraste e operação rápida.

A estética nunca deve prejudicar legibilidade, velocidade ou acessibilidade.

---

## 12. Arquitetura técnica inicial

Antes de implementar, analise o repositório e respeite a stack já existente.

Caso o projeto ainda esteja vazio, proponha uma stack antes de gerar grande quantidade de código.

Stack preferencial inicial:

- TypeScript em todo o projeto;
- Frontend: Next.js com App Router;
- UI: React;
- Estilização: Tailwind CSS;
- Componentes acessíveis;
- Backend: rotas do Next.js ou camada de serviços claramente separada;
- Banco: PostgreSQL;
- ORM: Prisma ou equivalente;
- Autenticação segura;
- Atualização em tempo real via WebSocket, serviço realtime ou mecanismo equivalente;
- Validação com schemas;
- Testes unitários e de integração;
- Testes end-to-end para fluxos críticos;
- Docker para ambiente local quando fizer sentido.

Não trocar tecnologias existentes sem justificar impacto, risco e migração.

---

## 13. Estrutura de domínio sugerida

Entidades principais:

- User;
- Role;
- Permission;
- Table;
- ServiceSession;
- Guest;
- Category;
- Product;
- ProductModifierGroup;
- ProductModifier;
- ProductionSector;
- Order;
- OrderItem;
- OrderItemModifier;
- Payment;
- PaymentMethod;
- Discount;
- ServiceCharge;
- Printer;
- PrintJob;
- AuditLog.

Usar nomes técnicos consistentes em inglês no código e textos em português na interface.

---

## 14. Qualidade e segurança

Sempre:

- Aplicar princípio do menor privilégio;
- Validar entradas no servidor;
- Proteger rotas;
- Evitar segredos no repositório;
- Usar `.env.example`;
- Nunca escrever chaves reais em documentação;
- Usar migrations;
- Fazer operações críticas em transações;
- Implementar índices adequados;
- Tratar concorrência;
- Registrar erros de impressão;
- Criar estratégia de reprocessamento;
- Não registrar senhas, tokens ou dados sensíveis em logs;
- Evitar dependências desnecessárias;
- Verificar vulnerabilidades antes de adicionar pacotes.

---

## 15. Testes mínimos

Criar testes para:

- Abrir mesa;
- Impedir duas comandas ativas na mesma mesa;
- Criar pedido;
- Evitar pedido duplicado;
- Separar itens por setor;
- Calcular subtotal;
- Calcular taxa de serviço;
- Aplicar desconto;
- Registrar pagamentos parciais;
- Usar múltiplas formas de pagamento;
- Impedir fechamento com saldo;
- Fechar e liberar mesa;
- Cancelar item com auditoria;
- Alterar preço sem modificar pedido antigo;
- Validar permissões;
- Reprocessar impressão com falha.

Fluxos financeiros devem possuir testes com valores exatos.

---

## 16. Forma de trabalho do Claude Code

Antes de alterar código:

1. Ler este arquivo;
2. Inspecionar o repositório;
3. Ler documentação relevante dentro de `/docs`;
4. Identificar a stack e padrões existentes;
5. Explicar brevemente o plano;
6. Listar arquivos que provavelmente serão alterados;
7. Apontar riscos ou decisões em aberto;
8. Implementar em etapas pequenas;
9. Executar lint, typecheck e testes;
10. Informar claramente o que foi feito.

Para tarefas grandes:

- Não tentar implementar todo o sistema de uma só vez;
- Dividir por módulo;
- Criar um plano verificável;
- Entregar incrementos funcionais;
- Manter o sistema executável após cada etapa;
- Atualizar documentação quando decisões forem tomadas.

---

## 17. Regras para geração de código

- Escrever código simples e legível;
- Evitar abstrações prematuras;
- Evitar arquivos gigantes;
- Separar domínio, infraestrutura e apresentação quando útil;
- Usar tipagem estrita;
- Não usar `any` sem justificativa;
- Evitar comentários que apenas repetem o código;
- Documentar regras de negócio não óbvias;
- Manter funções pequenas;
- Criar tratamento explícito de erros;
- Não esconder falhas;
- Não criar dados fictícios em produção;
- Não remover funcionalidades existentes sem solicitação;
- Não fazer refatorações amplas durante uma correção pequena;
- Não instalar pacotes sem explicar a necessidade;
- Não alterar schema sem migration;
- Não editar arquivos gerados manualmente.

---

## 18. Git e entregas

- Trabalhar em branches por funcionalidade;
- Usar commits pequenos e descritivos;
- Não misturar funcionalidades independentes;
- Não commitar `.env`;
- Não commitar credenciais;
- Antes de concluir uma tarefa, executar:
  - lint;
  - typecheck;
  - testes relevantes;
  - build, quando viável.
- Relatar comandos executados e resultados.
- Não afirmar que algo funciona sem testar.

Padrão sugerido de commits:

- `feat: ...`
- `fix: ...`
- `refactor: ...`
- `test: ...`
- `docs: ...`
- `chore: ...`

---

## 19. Documentação do projeto

Manter:

- `/docs/product/vision.md`
- `/docs/product/mvp-scope.md`
- `/docs/product/business-rules.md`
- `/docs/architecture/overview.md`
- `/docs/architecture/decisions/`
- `/docs/database/schema.md`
- `/docs/printing/architecture.md`
- `/docs/testing/strategy.md`
- `/docs/backlog.md`

Decisões importantes devem ser registradas como ADRs em:

`/docs/architecture/decisions/`

---

## 20. Impressão

A impressão automática não deve depender da janela padrão do navegador em cada pedido.

Arquitetura esperada:

1. O servidor registra o pedido;
2. O servidor cria um ou mais `PrintJob`;
3. Cada tarefa aponta para setor e impressora;
4. Um agente local ou serviço de impressão consulta ou recebe tarefas;
5. O agente imprime;
6. O agente confirma sucesso ou falha;
7. Falhas permanecem disponíveis para reprocessamento;
8. Reimpressões ficam registradas.

O pedido impresso deve conter:

- MITIZ;
- Número do pedido;
- Mesa;
- Horário;
- Garçom;
- Setor;
- Itens e quantidades;
- Pessoa, quando aplicável;
- Observações em destaque;
- Tipo: novo pedido, complemento, cancelamento ou reimpressão.

Não implementar impressão automática de forma improvisada sem documentar a estratégia.

---

## 21. Integração futura com PDV

Preparar o domínio para futura integração, mas não acoplar o MVP a um fornecedor específico.

Criar interfaces ou serviços que futuramente possam:

- Sincronizar produtos;
- Sincronizar preços;
- Enviar venda finalizada;
- Associar identificadores externos;
- Registrar status da integração;
- Reprocessar falhas.

Não inventar endpoints ou capacidades do PDV atual. A integração só será implementada após análise da API oficial disponível.

---

## 22. Critério de conclusão de uma funcionalidade

Uma funcionalidade só deve ser considerada concluída quando:

- Atende à regra de negócio;
- Possui validação;
- Respeita permissões;
- Funciona em celular e desktop quando aplicável;
- Trata erros;
- Possui testes adequados;
- Não quebra fluxos existentes;
- Foi documentada quando necessário;
- Passa em lint e typecheck;
- Foi testada no fluxo real correspondente.

---

## 23. Prioridade de desenvolvimento

Ordem inicial:

1. Fundação do projeto;
2. Autenticação e permissões;
3. Mesas e atendimentos;
4. Produtos e categorias;
5. Pedidos;
6. Tempo real;
7. Produção;
8. Impressão;
9. Caixa e pagamentos;
10. Cancelamentos e auditoria;
11. Histórico;
12. Relatórios básicos;
13. Integração futura.

---

## 24. Instrução para início de cada nova tarefa

Ao receber uma solicitação:

1. Identifique qual módulo será afetado;
2. Consulte os documentos relacionados;
3. Verifique regras de negócio e permissões;
4. Faça perguntas somente quando uma decisão impedir a implementação segura;
5. Caso seja possível avançar com uma hipótese reversível, declare a hipótese;
6. Apresente um plano curto;
7. Implemente a menor solução completa;
8. Teste;
9. Resuma alterações, riscos e próximos passos.

---

## 25. Restrições importantes

- Não tratar o sistema como simples carrinho de compras.
- O conceito central é um atendimento ativo vinculado a uma mesa.
- Não apagar registros financeiros ou operacionais.
- Não permitir edição silenciosa de pedidos enviados.
- Não fechar mesa com saldo pendente.
- Não depender exclusivamente do frontend para regras críticas.
- Não implementar recursos fiscais no MVP.
- Não criar integração fictícia com o PDV.
- Não comprometer a operação por estética ou complexidade técnica.
