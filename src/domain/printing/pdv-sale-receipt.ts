import { z } from "zod";

// Formato do `PrintJob.contentSnapshot` para o recibo de venda do PDV
// (Módulo 17, docs/backlog.md — Fase 2 do roadmap MITIZ Gestão; ADR 0010
// — Pagamento Combinado). Diferente do ticket de pedido (ticket.ts) e do
// resumo da comanda (bill-summary.ts): é um RECIBO de venda — itens,
// subtotal, total, forma de pagamento e troco (decisão registrada em
// docs/product/visao-mitiz-gestao.md, Fase 2) — não tem setor, não é
// sobre produção.
//
// `origins`: normalmente 1 ("Loja"). Quando a venda veio de um Pagamento
// Combinado (ADR 0010, "+ Adicionar consumo de mesa"), vêm 2 — a mesa
// sempre primeiro, depois a loja, cada uma com seus próprios itens e
// forma(s) de pagamento, nunca misturados numa linha só (mesmo racional
// de nunca existir um Payment só cobrindo as duas origens).
//
// Valores em dinheiro já vêm formatados em BRL ("R$ 90,00"), não como
// Decimal/string crua — mesmo racional de bill-summary.ts: o agente de
// impressão é deliberadamente minimalista, sem Decimal.js nem regra de
// formatação de moeda.
export const pdvSaleReceiptLineSchema = z.object({
  label: z.string(),
  amount: z.string(),
});

export const pdvSaleReceiptPaymentSchema = z.object({
  methodName: z.string(),
  amount: z.string(),
  // Troco (decisão do usuário, visão da Fase 2: "troco é só cálculo de
  // tela, nada gravado em Payment") — informação de impressão apenas,
  // nunca influencia o valor realmente registrado no pagamento. `null`
  // quando a forma não foi em dinheiro ou o operador não informou o
  // valor recebido.
  change: z.string().nullable(),
});

export const pdvSaleReceiptOriginSchema = z.object({
  // "Loja" ou "Mesa {número}".
  label: z.string(),
  items: z.array(pdvSaleReceiptLineSchema),
  subtotal: z.string(),
  payments: z.array(pdvSaleReceiptPaymentSchema),
});

export const pdvSaleReceiptContentSchema = z.object({
  type: z.literal("PDV_SALE"),
  restaurantName: z.string(),
  waiterName: z.string(),
  generatedAt: z.string(),
  origins: z.array(pdvSaleReceiptOriginSchema).min(1),
  total: z.string(),
});

export type PdvSaleReceiptLine = z.infer<typeof pdvSaleReceiptLineSchema>;
export type PdvSaleReceiptPayment = z.infer<typeof pdvSaleReceiptPaymentSchema>;
export type PdvSaleReceiptOrigin = z.infer<typeof pdvSaleReceiptOriginSchema>;
export type PdvSaleReceiptContent = z.infer<typeof pdvSaleReceiptContentSchema>;

// Mesmo padrão de buildBillSummaryContent/buildTicketContent: monta a
// partir de dado já resolvido (nomes e valores formatados), quem chama já
// buscou e calculou tudo.
export function buildPdvSaleReceiptContent(
  input: Omit<PdvSaleReceiptContent, "type" | "generatedAt"> & { generatedAt?: Date },
): PdvSaleReceiptContent {
  return pdvSaleReceiptContentSchema.parse({
    type: "PDV_SALE",
    restaurantName: input.restaurantName,
    waiterName: input.waiterName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    origins: input.origins,
    total: input.total,
  });
}
