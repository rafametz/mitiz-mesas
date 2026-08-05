# Escopo do MVP — MITIZ Mesas

Fonte de verdade: seção 4 do `CLAUDE.md`. Este documento detalha e organiza
esse escopo por módulo funcional para guiar o planejamento em
[../backlog.md](../backlog.md).

## 1. Incluído no MVP

### Identidade e acesso

- Autenticação (login por e-mail/usuário + senha);
- Perfis: Administrador, Caixa, Garçom, Produção;
- Permissões verificadas no backend, não só ocultação de UI.

### Cadastros (Administração)

- Usuários;
- Mesas (quantidade configurável, ~6–8 hoje);
- Categorias de produto;
- Produtos, com preço e destino de setor padrão;
- Adicionais/modificadores de produto;
- Disponibilidade de produto (em falta / disponível);
- Setores de produção (Cozinha, Parrilla, Bar, Caixa, Sem impressão);
- Impressoras por setor.

### Atendimento

- Abertura de mesa (quantidade de pessoas, responsável opcional, nomes opcionais,
  garçom responsável);
- Um atendimento ativo por mesa;
- Encerramento e liberação da mesa;
- Reabertura por administrador.

### Pedidos

- Lançamento de pedido (categoria → produto → quantidade → pessoa/consumo geral
  → modificadores → observação);
- Escolha do ponto da carne;
- Vínculo do item à mesa ou a uma pessoa específica;
- Separação automática do pedido por setor no envio;
- Rascunho editável livremente; após enviado, só cancelamento/complemento;
- Cancelamento controlado com auditoria (usuário, data, hora, motivo);
- Reimpressão.

### Tempo real e produção

- Atualização em tempo real de mesas, pedidos e status para todos os clientes
  conectados (sem depender de refresh manual);
- Fila de produção por setor com estados: recebido, em preparo, pronto, entregue;
- Impressão automática por setor via fila de `PrintJob` (ver
  [../printing/architecture.md](../printing/architecture.md) — a ser criado);
- Reprocessamento de falhas de impressão.

### Caixa e pagamentos

- Resumo/consulta do consumo parcial a qualquer momento;
- Taxa de serviço configurável e opcional no fechamento;
- Desconto com permissão, motivo e usuário responsável;
- Pagamentos parciais e múltiplas formas de pagamento;
- Divisão da conta por pessoa, por item, por valor ou igualmente;
- Fechamento da mesa somente com saldo zero.

### Auditoria e histórico

- Histórico de atendimentos por mesa;
- Registro de auditoria das ações críticas (cancelamento, desconto, reabertura,
  retirada de taxa, alteração de preço não retroativa, etc.).

### Robustez operacional

- Idempotência em requisições críticas (evitar pedido/pagamento duplicado por
  duplo toque ou reenvio de rede instável);
- Tratamento de concorrência (dois garçons na mesma mesa, caixa fechando
  enquanto pedido chega).

## 2. Fora do MVP

Emissão de nota fiscal, controle fiscal, controle completo de estoque,
integração com maquininha, integração com delivery, aplicativo nativo,
programa de fidelidade, reservas online, cardápio de autoatendimento do
cliente, integração definitiva com o PDV, contabilidade, gestão financeira
completa.

**Não implementar itens fora do MVP sem solicitação explícita do usuário.**

## 3. Fora do MVP mas preparado no domínio

- Identificadores externos e status de sincronização para uma futura
  integração com o PDV (sem inventar endpoints ou capacidades — ver seção 21
  do `CLAUDE.md`).

## 4. Não incluído por ser ambíguo (decisão pendente)

Ver "Decisões técnicas pendentes" em [../architecture/overview.md](../architecture/overview.md#decisões-pendentes)
e itens marcados `[DECISÃO PENDENTE]` em [../backlog.md](../backlog.md).
