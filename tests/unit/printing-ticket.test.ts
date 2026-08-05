import { describe, expect, it } from "vitest";
import { buildTicketContent, ticketContentSchema } from "@/domain/printing/ticket";

describe("buildTicketContent", () => {
  const baseInput = {
    type: "NEW_ORDER" as const,
    restaurantName: "MITIZ Boutique de Carnes",
    tableNumber: "Mesa 1",
    waiterName: "Fulano",
    sectorName: "Parrilla",
    orderSequenceNumber: 1,
    items: [
      {
        productName: "Porção de Anjo",
        quantity: 1,
        meatPointLabel: "Ao ponto",
        modifiers: [],
        notes: null,
        guestName: null,
      },
    ],
  };

  it("monta um conteúdo válido conforme o schema (CLAUDE.md seção 20)", () => {
    const content = buildTicketContent(baseInput);
    expect(() => ticketContentSchema.parse(content)).not.toThrow();
    expect(content.restaurantName).toBe("MITIZ Boutique de Carnes");
    expect(content.items).toHaveLength(1);
  });

  it("não inclui cancelReason quando não é ticket de cancelamento", () => {
    const content = buildTicketContent(baseInput);
    expect(content.cancelReason).toBeUndefined();
  });

  it("inclui cancelReason em ticket de cancelamento", () => {
    const content = buildTicketContent({
      ...baseInput,
      type: "CANCELLATION",
      cancelReason: "Cliente desistiu",
    });
    expect(content.cancelReason).toBe("Cliente desistiu");
  });

  it("usa a hora informada, ou a atual se omitida", () => {
    const fixedDate = new Date("2026-08-05T20:00:00.000Z");
    const content = buildTicketContent({ ...baseInput, generatedAt: fixedDate });
    expect(content.generatedAt).toBe(fixedDate.toISOString());
  });
});
