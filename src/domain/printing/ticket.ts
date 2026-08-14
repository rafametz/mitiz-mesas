import { z } from "zod";

// Formato do `PrintJob.contentSnapshot` (Módulo 7 — docs/printing/
// architecture.md). É dado puro, sem formatação de layout — quem decide
// como vira negrito/coluna/corte de papel é o agente local (ESC/POS) ou a
// prévia do admin, cada um do seu jeito; aqui só descrevemos o conteúdo
// exigido pelo CLAUDE.md seção 20.
//
// zod (não só um `type`) de propósito: `PrintJob.contentSnapshot` é
// `Json` no Prisma (não tipado) — todo lugar que lê de volta do banco
// precisa validar o formato na fronteira, não confiar cegamente.
export const ticketItemSchema = z.object({
  productName: z.string(),
  quantity: z.number().int().positive(),
  meatPointLabel: z.string().nullable(),
  modifiers: z.array(z.string()),
  notes: z.string().nullable(),
  guestName: z.string().nullable(),
});

export const ticketContentSchema = z.object({
  type: z.enum(["NEW_ORDER", "COMPLEMENT", "CANCELLATION", "REPRINT"]),
  restaurantName: z.string(),
  tableNumber: z.string(),
  waiterName: z.string(),
  sectorName: z.string(),
  orderSequenceNumber: z.number().int().positive(),
  generatedAt: z.string(),
  // Responsável da mesa (ServiceSession.responsibleName, preenchido opcional
  // na abertura) — pedido do usuário 2026-08-14: aparece no cabeçalho do
  // ticket, abaixo da hora, pra quem está na produção saber de quem é a
  // mesa mesmo sem abrir o app. Diferente de item.guestName (pessoa
  // específica vinculada a cada item) — este é sobre a mesa inteira.
  responsibleName: z.string().nullable(),
  items: z.array(ticketItemSchema),
  // Só presente em tickets de cancelamento.
  cancelReason: z.string().optional(),
});

export type TicketItem = z.infer<typeof ticketItemSchema>;
export type TicketContent = z.infer<typeof ticketContentSchema>;

// Monta o conteúdo do ticket a partir de dado já resolvido (nomes, não
// IDs) — desacoplado do Prisma de propósito, mesmo racional dos outros
// módulos de domínio: quem chama já buscou table/waiter/sector/items.
export function buildTicketContent(input: {
  type: TicketContent["type"];
  restaurantName: string;
  tableNumber: string;
  waiterName: string;
  sectorName: string;
  orderSequenceNumber: number;
  generatedAt?: Date;
  responsibleName?: string | null;
  items: TicketItem[];
  cancelReason?: string;
}): TicketContent {
  return ticketContentSchema.parse({
    type: input.type,
    restaurantName: input.restaurantName,
    tableNumber: input.tableNumber,
    waiterName: input.waiterName,
    sectorName: input.sectorName,
    orderSequenceNumber: input.orderSequenceNumber,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    responsibleName: input.responsibleName ?? null,
    items: input.items,
    ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
  });
}
