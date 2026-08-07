---
name: frontend-modernization
description: Audita, planeja e refatora telas e componentes do MITIZ Mesas para um padrão moderno, consistente, responsivo e centrado no usuário. Use ao criar telas, revisar UX/UI, modernizar componentes ou corrigir inconsistências visuais.
---

# Frontend Modernization — MITIZ Mesas

## Antes de começar

1. Leia `CLAUDE.md`.
2. Leia `.claude/rules/frontend-design.md`.
3. Leia `docs/design/design-system.md`.
4. Leia a documentação do módulo afetado.
5. Inspecione stack, componentes, tokens e telas semelhantes.
6. Identifique regras de negócio, estados e permissões.
7. Não altere arquivos antes de apresentar uma auditoria breve.

## Auditoria

Analise:
- hierarquia visual;
- clareza da ação principal;
- consistência;
- legibilidade;
- responsividade;
- acessibilidade;
- densidade de informação;
- número de toques;
- feedback;
- prevenção de erros;
- estados de carregamento, vazio e erro;
- ícones;
- botões;
- formulários;
- navegação;
- identidade MITIZ.

Classifique cada problema como crítico, alto, médio ou baixo.

## Plano

Apresente:
1. problemas encontrados;
2. objetivo;
3. mudanças propostas;
4. componentes reutilizados;
5. componentes novos necessários;
6. arquivos previstos;
7. riscos de regressão;
8. testes necessários.

Prefira melhoria incremental a uma reformulação total.

## Implementação

- Preserve regras e integrações.
- Use tokens do design system.
- Evite valores arbitrários.
- Use a biblioteca de ícones adotada.
- Trate mobile e desktop.
- Implemente carregamento, vazio, erro, sucesso e permissão.
- Bloqueie duplo envio.
- Não misture refatoração visual com alteração ampla de negócio.
- Não adicione dependência sem justificar.

## Validação

Verifique:
- celular pequeno;
- celular comum;
- tablet;
- desktop;
- teclado e foco;
- contraste;
- textos longos;
- valores grandes;
- lista vazia;
- erro de API;
- carregamento;
- tempo real;
- permissão insuficiente;
- ação duplicada.

Execute lint, typecheck, testes, build e testes end-to-end relevantes.

## Entrega

Informe:
- o que mudou;
- o que não mudou;
- componentes criados ou reutilizados;
- testes executados;
- limitações restantes.

## Tela de mesas

Verifique:
- cards legíveis rapidamente;
- status não depende só de cor;
- mesa livre possui ação direta;
- mesa ocupada abre detalhes;
- fechamento fica destacado;
- pedido pronto possui alerta;
- valor, pessoas e tempo ficam visíveis sem poluição;
- mobile permite uso com uma mão;
- fechamento não ocorre acidentalmente.

## Pedidos

Verifique:
- poucos toques para adicionar item;
- categorias acessíveis;
- quantidade simples;
- pessoa e observação claras;
- revisão antes do envio;
- loading e idempotência;
- confirmação inequívoca;
- erro preserva o pedido em edição.

## Caixa

Verifique:
- subtotal, taxa, desconto, pago e saldo distintos;
- divisão compreensível;
- pagamentos parciais visíveis;
- conclusão bloqueada com saldo;
- ações financeiras com confirmação adequada;
- valores em BRL;
- diferença clara entre fechar conta e liberar mesa.

## Exemplos de uso

Auditoria:
`/frontend-modernization audite a tela de mesas e apresente um plano, sem editar arquivos`

Refatoração:
`/frontend-modernization refatore a tela de mesas conforme o design system, preservando as regras de negócio`

Criação:
`/frontend-modernization crie a tela de fila de impressão conforme os padrões do projeto`
