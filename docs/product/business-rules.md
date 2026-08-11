# Regras de Negócio — MITIZ Mesas

Fonte de verdade: seções 7, 8 e 9 do `CLAUDE.md`. Este documento é a
referência operacional para implementação e testes
(ver [../testing/strategy.md](../testing/strategy.md) — a ser criado).

## 1. Máquinas de estado

### Mesa (`Table` / `ServiceSession` combinados na visão do card)

`FREE` → `OCCUPIED` → `WAITING_SERVICE` → `ORDER_IN_PROGRESS` →
`WAITING_CLOSING` (fechamento solicitado) → (fechamento) → `FREE`

Estados adicionais: `RESERVED`, `BLOCKED` (fora do fluxo normal, definidos por
administrador/caixa). "Tem pagamento parcial?" não é mais um estado — é
sempre calculado a partir de `paidAmount`/`balanceAmount` e só exibido na
tela (revisão 2026-08-10).

### Atendimento (`ServiceSession`)

`OPEN` → `CLOSING` → `CLOSED`
Exceções: `REOPENED` (a partir de `CLOSED`, só admin), `CANCELLED` (a partir de
`OPEN`, sem pedidos enviados), `CLOSING` → `OPEN` (cancelar a solicitação de
fechamento sem passar por `CLOSED`/`REOPENED`).

**Revisão 2026-08-10 — separação PAGAMENTO / FECHAMENTO DO ATENDIMENTO**
(ver ADR em `docs/architecture/decisions/`): antes, registrar pagamento
só era permitido depois de solicitar fechamento e sempre acabava mudando
o status da sessão (`PARTIALLY_PAID`/`PAID`, removidos do enum), o que
bloqueava pedido novo como efeito colateral de um pagamento parcial no
meio do atendimento. Agora pagamento é permitido em `OPEN` inteiro e
nunca muda o status sozinho; só `CLOSING` bloqueia pedido novo, e só
através da ação explícita "solicitar fechamento".

### Pedido (`Order`)

`DRAFT` → `SENT` → `RECEIVED` → `IN_PREPARATION` → `READY` → `DELIVERED`
Exceções: `PARTIALLY_CANCELLED`, `CANCELLED`.

### Item do pedido (`OrderItem`)

`DRAFT` → `SENT` → `IN_PREPARATION` → `READY` → `DELIVERED`
Exceções: `CANCELLATION_REQUESTED` → `CANCELLED`.

### Impressão (`PrintJob`)

`PENDING` → `PROCESSING` → `PRINTED`
Exceção: `FAILED` (elegível a reprocessamento), `CANCELLED`.

Transições inválidas devem ser rejeitadas no backend com erro explícito, nunca
silenciosamente ignoradas.

## 2. Regras obrigatórias

1. Uma mesa só pode ter um atendimento ativo (`OPEN`/`CLOSING`) por vez.
2. Mesa com atendimento fechado (ou em `CLOSING`) não recebe novos pedidos.
3. Pedido em `DRAFT` pode ser editado livremente pelo autor.
4. Pedido em `SENT` (ou além) não é alterado silenciosamente.
5. Alteração após envio gera cancelamento, complemento ou novo item — nunca
   edição in-place do item já enviado.
6. Todo cancelamento registra usuário, data/hora e motivo (auditoria).
7. Itens cancelados nunca são apagados definitivamente (soft state, mantém
   histórico).
8. Pagamentos nunca são apagados definitivamente.
9. O preço do item é congelado no momento do lançamento do pedido.
10. Alterar o preço de um produto no cadastro não retroage sobre vendas
    já lançadas.
11. Mesa só fecha quando o fechamento foi solicitado (`CLOSING`) **e** o
    saldo (`total − pago`) é exatamente zero. Saldo zero sozinho em
    `OPEN` nunca fecha a mesa.
12. Pagamento parcial reduz o saldo da comanda, a qualquer momento do
    atendimento ativo (`OPEN` ou `CLOSING`) — nunca exige fechamento
    solicitado antes, nunca bloqueia pedido novo sozinho.
13. É possível combinar mais de uma forma de pagamento no mesmo fechamento.
14. Todo desconto registra tipo, valor, motivo e usuário responsável.
15. Taxa de serviço é configurável e opcional no fechamento.
16. Retirada da taxa de serviço pelo cliente fica registrada.
17. Operações financeiras (pagamento, desconto, fechamento) são transacionais —
    tudo ou nada.
18. Pedidos não são duplicados por duplo toque ou reenvio de requisição.
19. Toda requisição crítica aceita chave de idempotência.
20. Valores monetários não usam ponto flutuante impreciso — decimal no banco
    ou inteiro em centavos na aplicação.
21. (mesmo princípio de 20, reforçado no `CLAUDE.md` original)
22. Ações críticas geram trilha de auditoria (`AuditLog`).
23. Horários são armazenados de forma consistente (recomendado: UTC no banco)
    e apresentados sempre em `America/Sao_Paulo`.
24. O frontend nunca é a única camada de validação.
25. Permissões são verificadas no backend em toda operação sensível.

## 3. Fluxo — Abrir mesa

1. Selecionar mesa `FREE`;
2. Informar quantidade de pessoas;
3. Informar responsável (opcional);
4. Informar nomes/apelidos das pessoas (opcional);
5. Definir garçom responsável;
6. Confirmar abertura → cria `ServiceSession` em `OPEN`, mesa vai para
   `OCCUPIED`.

## 4. Fluxo — Criar pedido

1. Entrar na mesa;
2. "Novo pedido";
3. Escolher categoria → produto;
4. Informar quantidade;
5. Escolher pessoa ou consumo geral;
6. Selecionar modificadores;
7. Informar observações;
8. Revisar;
9. Enviar (`DRAFT` → `SENT`).

## 5. Fluxo — Enviar para produção

1. Validar disponibilidade e preço no servidor (nunca confiar no valor vindo
   do cliente);
2. Criar o pedido de forma transacional;
3. Separar itens por setor de destino do produto;
4. Criar `PrintJob` por setor impactado;
5. Emitir evento em tempo real para todos os clientes conectados relevantes
   (mesa, produção do(s) setor(es), caixa);
6. Exibir confirmação clara ao garçom (sucesso, ou erro específico se algo
   falhar).

## 6. Fluxo — Pagamento e fechamento de mesa (revisão 2026-08-10)

### 6a. Pagamento — independente do fechamento

Disponível a qualquer momento do atendimento ativo (`OPEN` ou `CLOSING`):

1. Registrar pagamento — geral da mesa (`guestId` nulo) ou vinculado a
   uma pessoa específica;
2. Divisão percentual/igual, quando usada, é só calculadora — o valor
   final é transformado em R$ e gravado no pagamento, nunca uma
   porcentagem recalculada depois;
3. Saldo recalculado a partir de consumo + taxa − desconto − pago,
   sempre, independente do status;
4. Pessoa pode ser marcada `SETTLED` manualmente pelo caixa (sem cálculo
   obrigatório) depois de registrar o pagamento dela — some do seletor de
   "pessoa" em pedido novo por padrão, itens já lançados pra ela não são
   afetados.

### 6b. Fechamento do atendimento

1. Solicitar fechamento (`OPEN` → `CLOSING`) — só a partir daqui novo
   pedido é bloqueado; pode ser cancelado (`CLOSING` → `OPEN`) sem passar
   por `CLOSED`/`REOPENED`;
2. Conferir itens da comanda;
3. Aplicar taxa de serviço (se optado) — só permitido em `CLOSING`;
4. Aplicar desconto, se autorizado — só permitido em `CLOSING`;
5. Escolher forma de divisão (pessoa, item, valor, igual) — apoio pro
   pagamento da seção 6a, que pode já ter começado antes mesmo do
   fechamento ser solicitado;
6. Registrar o(s) pagamento(s) que faltarem (mesma ação da seção 6a);
7. Validar `status == CLOSING` e saldo == 0 no servidor antes de permitir
   finalizar;
8. Finalizar atendimento (`CLOSING` → `CLOSED`);
9. Liberar mesa (`FREE`);
10. Manter histórico completo do atendimento e seus pedidos/pagamentos.

## 7. Perfis e permissões (resumo)

| Ação                                   | Admin     | Caixa        | Garçom   | Produção             |
| -------------------------------------- | --------- | ------------ | -------- | -------------------- |
| Abrir mesa                             | ✔         | –            | ✔        | –                    |
| Lançar/enviar pedido                   | ✔         | –            | ✔        | –                    |
| Marcar status de produção              | ✔         | –            | –        | ✔ (do próprio setor) |
| Registrar pagamento                    | ✔         | ✔            | –        | –                    |
| Aplicar desconto                       | ✔ (total) | ✔ (limitado) | –        | –                    |
| Autorizar cancelamento                 | ✔         | –            | solicita | –                    |
| Fechar mesa                            | ✔         | ✔            | solicita | –                    |
| Reabrir mesa                           | ✔         | –            | –        | –                    |
| Cadastros (produto/mesa/setor/usuário) | ✔         | –            | –        | –                    |
| Ver auditoria/relatórios               | ✔         | parcial      | –        | –                    |

Detalhamento completo em seção 5 do `CLAUDE.md`; qualquer divergência, o
`CLAUDE.md` prevalece.
