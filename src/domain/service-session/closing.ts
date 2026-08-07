import { Prisma, type ServiceSessionStatus } from "@prisma/client";
import { toDecimal, ZERO } from "@/lib/money";

// Regras puras do fluxo de fechamento (docs/product/business-rules.md §6,
// CLAUDE.md regra 11/12) — em cima da máquina de estados já existente em
// ./states.ts, sem duplicá-la.

// Só a partir de um atendimento aberto de verdade — não faz sentido pedir
// fechamento de algo que já está fechando ou já fechado.
export function canRequestClosing(status: ServiceSessionStatus): boolean {
  return status === "OPEN";
}

// Desconto/taxa de serviço/pagamento só fazem sentido depois que o
// fechamento foi solicitado (business-rules.md §6, passos 1→3/4/6) — evita
// aplicar taxa/desconto num atendimento que ainda pode receber novo pedido.
export function canModifyClosingCharges(status: ServiceSessionStatus): boolean {
  return status === "WAITING_CLOSING" || status === "PARTIALLY_PAID";
}

export function canRegisterPayment(status: ServiceSessionStatus): boolean {
  return status === "WAITING_CLOSING" || status === "PARTIALLY_PAID";
}

// Regra 11: só fecha com saldo exatamente zero.
export function canCloseTable(
  status: ServiceSessionStatus,
  balanceAmount: Prisma.Decimal.Value,
): boolean {
  return status === "PAID" && toDecimal(balanceAmount).equals(ZERO);
}

// Depois de registrar um pagamento, pra qual status o atendimento vai —
// PARTIALLY_PAID enquanto sobra saldo, PAID quando zera (regra 12).
export function statusAfterPayment(
  remainingBalance: Prisma.Decimal.Value,
): "PARTIALLY_PAID" | "PAID" {
  return toDecimal(remainingBalance).equals(ZERO) ? "PAID" : "PARTIALLY_PAID";
}
