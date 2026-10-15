// Regras puras do Pagamento Combinado (ADR 0010): cada "perna" (mesa, PDV)
// usa o pagamento por itens de um jeito diferente, por decisão explícita
// do pedido original (seção 6) — mesa sempre paga por seleção de consumo
// (PaymentItemAllocation), loja sempre paga por valor cheio da venda, nunca
// o contrário. Validado aqui (puro, sem banco) e de novo no orquestrador
// (register-combined-checkout.ts), que é quem decide o que fazer com um
// resultado inválido.
export function isValidTablePaymentLine(line: { allocations?: unknown[] | null }): boolean {
  return Boolean(line.allocations && line.allocations.length > 0);
}

export function isValidPdvPaymentLine(line: {
  allocations?: unknown[] | null;
  amount?: number | null;
}): boolean {
  return !line.allocations?.length && line.amount !== undefined && line.amount !== null;
}
