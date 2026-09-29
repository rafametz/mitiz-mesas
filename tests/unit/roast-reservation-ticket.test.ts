import { describe, expect, it } from "vitest";
import {
  buildRoastReservationTicketContent,
  roastReservationTicketContentSchema,
} from "@/domain/printing/roast-reservation-ticket";

describe("buildRoastReservationTicketContent", () => {
  const baseInput = {
    restaurantName: "MITIZ Boutique de Carnes",
    customerName: "Cliente Teste",
    customerPhone: "11999998888",
    productionDayDateLabel: "29/09/2026",
    waiterName: "Fulano",
    notes: null,
    items: [{ productName: "Costela de boi", quantity: 3, unit: "kg" }],
  };

  it("monta um conteúdo válido conforme o schema", () => {
    const content = buildRoastReservationTicketContent(baseInput);
    expect(() => roastReservationTicketContentSchema.parse(content)).not.toThrow();
    expect(content.type).toBe("ROAST_RESERVATION");
    expect(content.items).toHaveLength(1);
  });

  it("carrega telefone e observação quando informados", () => {
    const content = buildRoastReservationTicketContent({
      ...baseInput,
      notes: "Retirar até as 18h",
    });
    expect(content.customerPhone).toBe("11999998888");
    expect(content.notes).toBe("Retirar até as 18h");
  });

  it("telefone e observação ficam null quando não informados", () => {
    const content = buildRoastReservationTicketContent({
      ...baseInput,
      customerPhone: null,
      notes: null,
    });
    expect(content.customerPhone).toBeNull();
    expect(content.notes).toBeNull();
  });

  it("usa a hora informada, ou a atual se omitida", () => {
    const fixedDate = new Date("2026-09-29T18:00:00.000Z");
    const content = buildRoastReservationTicketContent({ ...baseInput, generatedAt: fixedDate });
    expect(content.generatedAt).toBe(fixedDate.toISOString());
  });

  it("rejeita quantidade fracionada ou zero no schema (reserva é sempre por unidade inteira)", () => {
    expect(() =>
      roastReservationTicketContentSchema.parse({
        ...buildRoastReservationTicketContent(baseInput),
        items: [{ productName: "Costela de boi", quantity: 2.5, unit: "kg" }],
      }),
    ).toThrow();
    expect(() =>
      roastReservationTicketContentSchema.parse({
        ...buildRoastReservationTicketContent(baseInput),
        items: [{ productName: "Costela de boi", quantity: 0, unit: "kg" }],
      }),
    ).toThrow();
  });
});
