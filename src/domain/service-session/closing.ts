import { Prisma, type ServiceSessionStatus } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";

// Regras puras do fluxo de fechamento (docs/product/business-rules.md §6,
// CLAUDE.md regra 11/12) — em cima da máquina de estados já existente em
// ./states.ts, sem duplicá-la.
//
// Revisão 2026-08-10 — PAGAMENTO e FECHAMENTO são conceitos separados:
// antes, registrar pagamento só era permitido depois de solicitar
// fechamento, e sempre acabava mudando o status da sessão (ver
// statusAfterPayment, removida). Isso bloqueava novo pedido como efeito
// colateral de um pagamento parcial no meio do atendimento — regra errada
// pra operação real (mesa de 4 pessoas, uma paga a parte dela e vai
// embora, as outras continuam pedindo). Agora: pagamento é permitido em
// OPEN inteiro, não só depois do fechamento pedido; o saldo é sempre
// recalculado a partir do consumo (recalculateSessionTotals), suba ou
// desça o total, em qualquer status ativo.

// Só a partir de um atendimento aberto de verdade — não faz sentido pedir
// fechamento de algo que já está fechando ou já fechado.
export function canRequestClosing(status: ServiceSessionStatus): boolean {
  return status === "OPEN";
}

// Volta pra OPEN sem precisar fechar e reabrir o atendimento inteiro —
// "pedi a conta por engano" ou "o cliente quer pedir mais alguma coisa".
export function canCancelClosingRequest(status: ServiceSessionStatus): boolean {
  return status === "CLOSING";
}

// Taxa de serviço e desconto continuam decisões do fechamento da conta
// (business-rules.md §6, passos 3/4) — só fazem sentido depois que o
// fechamento foi solicitado, não a qualquer momento do atendimento.
export function canModifyClosingCharges(status: ServiceSessionStatus): boolean {
  return status === "CLOSING";
}

// Pagamento é permitido a qualquer momento do atendimento ativo — OPEN
// (pagamento parcial no meio do serviço, sem bloquear novo pedido) ou
// CLOSING (fechando a conta de vez). Nunca decide o status da sessão
// (ver register-payment.ts) — só reduz o saldo.
export function canRegisterPayment(status: ServiceSessionStatus): boolean {
  return status === "OPEN" || status === "CLOSING";
}

// Regra 11: só fecha com o fechamento solicitado (CLOSING) e saldo
// exatamente zero. Saldo zero sozinho, em OPEN, nunca fecha a mesa
// sozinho — é só informação (a mesa pode voltar a ter saldo > 0 com um
// pedido novo).
export function canCloseTable(
  status: ServiceSessionStatus,
  balanceAmount: Prisma.Decimal.Value,
): boolean {
  return status === "CLOSING" && toDecimal(balanceAmount).equals(ZERO);
}
