import { z } from "zod";

// Formato do `PrintJob.contentSnapshot` para o ticket de reserva de assado
// (módulo Reservas de Assados, 2026-10-04, pedido do usuário) — impresso
// automaticamente ao criar a reserva, pra quem for entregar não precisar
// mais anotar cliente/itens à mão. Schema próprio, separado de ticket.ts:
// não é sobre um Order (sem setor, sem número de pedido, sem ponto da
// carne) nem sobre um atendimento (sem mesa/retirada) — é sobre a reserva
// em si, mesmo racional de bill-summary.ts ter o schema próprio.
export const roastReservationTicketItemSchema = z.object({
  productName: z.string(),
  // Sempre inteiro — reserva de assado é sempre por unidade (decisão do
  // usuário 2026-10-04, ver domain/roast/production.ts).
  quantity: z.number().int().positive(),
  unit: z.string(),
});

export const roastReservationTicketContentSchema = z.object({
  type: z.literal("ROAST_RESERVATION"),
  restaurantName: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  // Já formatado ("DD/MM/AAAA") — quem decide formatação é o servidor,
  // nunca o agente (mesmo racional de meatPointLabel em ticket.ts).
  productionDayDateLabel: z.string(),
  waiterName: z.string(),
  generatedAt: z.string(),
  notes: z.string().nullable(),
  items: z.array(roastReservationTicketItemSchema),
});

export type RoastReservationTicketItem = z.infer<typeof roastReservationTicketItemSchema>;
export type RoastReservationTicketContent = z.infer<typeof roastReservationTicketContentSchema>;

// Mesmo padrão de buildTicketContent/buildBillSummaryContent — monta a
// partir de dado já resolvido (nomes, não IDs), desacoplado do Prisma.
export function buildRoastReservationTicketContent(input: {
  restaurantName: string;
  customerName: string;
  customerPhone: string | null;
  productionDayDateLabel: string;
  waiterName: string;
  generatedAt?: Date;
  notes: string | null;
  items: RoastReservationTicketItem[];
}): RoastReservationTicketContent {
  return roastReservationTicketContentSchema.parse({
    type: "ROAST_RESERVATION",
    restaurantName: input.restaurantName,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    productionDayDateLabel: input.productionDayDateLabel,
    waiterName: input.waiterName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    notes: input.notes,
    items: input.items,
  });
}
