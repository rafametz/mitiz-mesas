# Regras de Negócio — MITIZ Mesas

Fonte de verdade: seções 7, 8 e 9 do `CLAUDE.md`. Este documento é a
referência operacional para implementação e testes
(ver [../testing/strategy.md](../testing/strategy.md) — a ser criado).

## 1. Máquinas de estado

### Mesa (`Table` / `ServiceSession` combinados na visão do card)

`FREE` → `OCCUPIED` → `WAITING_SERVICE` → `ORDER_IN_PROGRESS` →
`WAITING_CLOSING` → `PARTIALLY_PAID` → (fechamento) → `FREE`

Estados adicionais: `RESERVED`, `BLOCKED` (fora do fluxo normal, definidos por
administrador/caixa).

### Atendimento (`ServiceSession`)

`OPEN` → `WAITING_CLOSING` → `PARTIALLY_PAID` → `PAID` → `CLOSED`
Exceções: `REOPENED` (a partir de `CLOSED`, só admin), `CANCELLED` (a partir de
`OPEN`, sem pedidos enviados).

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

1. Uma mesa só pode ter um atendimento ativo (`OPEN`/`WAITING_CLOSING`/
   `PARTIALLY_PAID`) por vez.
2. Mesa com atendimento fechado não recebe novos pedidos.
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
11. Mesa só fecha quando o saldo (`total − pago`) é exatamente zero.
12. Pagamento parcial reduz o saldo da comanda.
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

## 6. Fluxo — Fechar mesa

1. Solicitar fechamento (`WAITING_CLOSING`);
2. Conferir itens da comanda;
3. Aplicar taxa de serviço (se optado);
4. Aplicar desconto, se autorizado;
5. Escolher forma de divisão (pessoa, item, valor, igual);
6. Registrar um ou mais pagamentos (`PARTIALLY_PAID` enquanto saldo > 0);
7. Validar saldo == 0 no servidor antes de permitir finalizar;
8. Finalizar atendimento (`PAID` → `CLOSED`);
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
