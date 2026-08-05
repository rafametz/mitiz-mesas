# Visão do Produto — MITIZ Mesas

## 1. O que é

O **MITIZ Mesas** é um sistema web responsivo de atendimento de salão para a MITIZ
Boutique de Carnes: abertura de mesas, lançamento de pedidos, roteamento para
setores de produção (cozinha, parrilla, bar), acompanhamento em tempo real,
fechamento de conta e divisão de pagamento.

Não é um PDV fiscal. Na primeira versão ele **coexiste** com o PDV fiscal atual —
o caixa continua emitindo o documento fiscal por fora — e o domínio é desenhado
para permitir uma integração futura sem acoplamento prematuro a um fornecedor
específico (ver seção 21 do `CLAUDE.md`).

## 2. Por que existe

Hoje o controle de mesas, comandas e envio de pedidos para a cozinha depende de
processos manuais/informais. Isso gera:

- Pedidos perdidos ou duplicados entre salão e produção;
- Falta de visibilidade em tempo real do status de cada mesa para o caixa;
- Dificuldade de dividir conta e registrar pagamentos parciais de forma confiável;
- Ausência de trilha de auditoria para cancelamentos, descontos e alterações.

## 3. Para quem

| Perfil                          | Onde usa                     | Necessidade principal                                     |
| ------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Garçom                          | Celular Android, uma mão     | Abrir mesa e lançar pedido rápido, sem erro               |
| Caixa                           | Desktop/tablet               | Visão geral das mesas, fechamento, divisão, pagamento     |
| Produção (cozinha/parrilla/bar) | Tablet ou impressora térmica | Fila de pedidos do próprio setor, status claro            |
| Administrador                   | Desktop                      | Cadastro de produtos, mesas, setores, usuários, auditoria |

## 4. Objetivo do MVP

Permitir que a operação de salão da MITIZ funcione de ponta a ponta dentro do
sistema — abrir mesa, pedir, produzir, fechar e pagar — com atualização em
tempo real e sem depender do PDV fiscal para o fluxo operacional do dia a dia.
Ver detalhamento em [mvp-scope.md](mvp-scope.md).

## 5. Fora de escopo (por ora)

Nota fiscal, controle fiscal, estoque completo, integração com maquininha,
delivery, app nativo, fidelidade, reservas online, cardápio de autoatendimento,
integração definitiva com o PDV, contabilidade e gestão financeira completa.
Não implementar sem solicitação explícita (ver seção 4 do `CLAUDE.md`).

## 6. Restrições não negociáveis

- Uma mesa tem no máximo **um atendimento ativo** por vez;
- Nenhum registro financeiro ou operacional é apagado — apenas cancelado/estornado
  com auditoria;
- Pedido enviado não é editado silenciosamente;
- Mesa não fecha com saldo pendente;
- O frontend nunca é a única camada de validação — regras críticas são
  revalidadas no backend;
- Valores monetários em BRL, sem ponto flutuante impreciso (decimal ou inteiro
  em centavos);
- Datas/horários armazenados de forma consistente e exibidos em
  `America/Sao_Paulo`.

## 7. Critério de sucesso do MVP

- As ~6–8 mesas da operação são abertas, atendidas, produzidas e fechadas
  inteiramente pelo sistema, em paralelo, sem duplicar pedidos;
- Garçom consegue operar majoritariamente com uma mão, no celular;
- Caixa vê o estado de todas as mesas em tempo real, sem recarregar a página;
- Produção recebe e confirma pedidos por setor, com impressão automática
  funcionando ou com fallback claro quando falha;
- Todo cancelamento, desconto e pagamento fica auditável (quem, quando, por quê).

Documentos relacionados: [mvp-scope.md](mvp-scope.md),
[business-rules.md](business-rules.md),
[../architecture/overview.md](../architecture/overview.md),
[../backlog.md](../backlog.md).
