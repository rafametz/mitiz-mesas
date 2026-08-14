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

// Cabeçalho de retirada (módulo Retiradas, 2026-08-14) — quando o ticket é
// de um atendimento sem mesa, `tableNumber` some e este objeto some no
// lugar, deixando "muito evidente que se trata de uma retirada" (pedido do
// usuário) no papel: número da retirada, cliente, telefone e horário
// previsto, quando informados. Compartilhado entre ticket.ts e
// bill-summary.ts (mesmo cabeçalho nos dois tipos de impresso).
export const ticketPickupHeaderSchema = z.object({
  number: z.number().int().positive(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  // Já formatado ("20:00", America/Sao_Paulo) — mesmo racional de
  // meatPointLabel: quem decide formatação é o servidor, não o agente.
  requestedTimeLabel: z.string().nullable(),
});
export type TicketPickupHeader = z.infer<typeof ticketPickupHeaderSchema>;

export const ticketContentSchema = z.object({
  type: z.enum(["NEW_ORDER", "COMPLEMENT", "CANCELLATION", "REPRINT"]),
  restaurantName: z.string(),
  // Exatamente um entre tableNumber/pickup é preenchido, conforme o tipo
  // do atendimento — nunca os dois, nunca nenhum. `.nullish()` em vez de
  // `.nullable()` em ambos (e em responsibleName, abaixo) porque tickets
  // impressos antes desses campos existirem têm contentSnapshot sem a
  // chave: reparsear um job antigo (reimpressão, fila pendente) não pode
  // quebrar só porque a chave nunca existiu naquele registro.
  tableNumber: z.string().nullish(),
  pickup: ticketPickupHeaderSchema.nullish(),
  waiterName: z.string(),
  sectorName: z.string(),
  orderSequenceNumber: z.number().int().positive(),
  generatedAt: z.string(),
  // Responsável da mesa (ServiceSession.responsibleName, preenchido opcional
  // na abertura) — pedido do usuário 2026-08-14: aparece no cabeçalho do
  // ticket, abaixo da hora, pra quem está na produção saber de quem é a
  // mesa mesmo sem abrir o app. Diferente de item.guestName (pessoa
  // específica vinculada a cada item) — este é sobre a mesa inteira. Não
  // se aplica a retirada (o cliente já aparece no cabeçalho de pickup).
  responsibleName: z.string().nullish(),
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
  // Atendimento de mesa: informa tableNumber. Atendimento de retirada:
  // informa pickup. Nunca os dois.
  tableNumber?: string | null;
  pickup?: TicketPickupHeader | null;
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
    tableNumber: input.tableNumber ?? null,
    pickup: input.pickup ?? null,
    waiterName: input.waiterName,
    sectorName: input.sectorName,
    orderSequenceNumber: input.orderSequenceNumber,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    responsibleName: input.responsibleName ?? null,
    items: input.items,
    ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
  });
}
