import { z } from "zod";

// Formato do `PrintJob.contentSnapshot` para o ticket de "Imprimir
// conferência" (CLAUDE.md seção 10, ações da tela da mesa). Schema
// separado de `ticket.ts` de propósito: não é sobre um Order específico
// (não tem setor nem número de pedido), é um resumo do atendimento inteiro
// no momento em que foi impresso — itens consolidados de todos os
// pedidos, total, divisão igual por pessoa e, se já houver, pagamentos e
// saldo.
//
// Valores em dinheiro já vêm formatados em BRL ("R$ 90,00"), não como
// Decimal/string crua — o agente de impressão (printer-agent/) é
// deliberadamente minimalista, sem Decimal.js nem regra de formatação de
// moeda; quem decide isso é o servidor, igual a `meatPointLabel` já faz em
// ticket.ts (rótulo pronto, não o enum cru).
export const billSummaryItemSchema = z.object({
  label: z.string(),
  quantity: z.number().int().positive(),
  // Valor unitário (produto + adicionais, já dividido pela quantidade) —
  // pedido do usuário 2026-08-13: a lista de itens do resumo impresso
  // precisa mostrar quantidade, nome, valor unitário e total, não só o
  // total da linha.
  unitPrice: z.string(),
  lineTotal: z.string(),
});

export const billSummaryPaymentSchema = z.object({
  methodName: z.string(),
  amount: z.string(),
  guestName: z.string().nullable(),
});

export const billSummaryContentSchema = z.object({
  type: z.literal("BILL_SUMMARY"),
  restaurantName: z.string(),
  tableNumber: z.string(),
  waiterName: z.string(),
  generatedAt: z.string(),
  items: z.array(billSummaryItemSchema),
  subtotal: z.string(),
  // null = nenhuma taxa/desconto aplicado ainda (distinto de "R$ 0,00", que
  // indicaria uma taxa aplicada e depois retirada) — mesmo racional do
  // "Nenhuma taxa aplicada ainda" já usado na tela de pagamentos.
  serviceCharge: z.string().nullable(),
  discount: z.string().nullable(),
  total: z.string(),
  guestCount: z.number().int().positive(),
  // Valor de referência "total / pessoas", já formatado — pedido do
  // usuário 2026-08-13: o resumo impresso não precisa listar "Parte 1,
  // Parte 2..." (isso é o splitEqually de split.ts, usado de verdade no
  // fechamento/pagamento por pessoa), só mostrar quantas pessoas e quanto
  // seria cada parte. Pode não ser centavo-perfeito quando o total não é
  // múltiplo exato da quantidade de pessoas — é só informativo no papel,
  // não vira registro de pagamento.
  perPersonShare: z.string(),
  payments: z.array(billSummaryPaymentSchema),
  paidAmount: z.string(),
  balance: z.string(),
});

export type BillSummaryItem = z.infer<typeof billSummaryItemSchema>;
export type BillSummaryPayment = z.infer<typeof billSummaryPaymentSchema>;
export type BillSummaryContent = z.infer<typeof billSummaryContentSchema>;

// Mesmo padrão de buildTicketContent (ticket.ts): monta a partir de dado já
// resolvido (nomes e valores formatados, não IDs/Decimal) — quem chama já
// buscou e calculou tudo.
export function buildBillSummaryContent(
  input: Omit<BillSummaryContent, "type" | "generatedAt"> & { generatedAt?: Date },
): BillSummaryContent {
  return billSummaryContentSchema.parse({
    type: "BILL_SUMMARY",
    restaurantName: input.restaurantName,
    tableNumber: input.tableNumber,
    waiterName: input.waiterName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    items: input.items,
    subtotal: input.subtotal,
    serviceCharge: input.serviceCharge,
    discount: input.discount,
    total: input.total,
    guestCount: input.guestCount,
    perPersonShare: input.perPersonShare,
    payments: input.payments,
    paidAmount: input.paidAmount,
    balance: input.balance,
  });
}
