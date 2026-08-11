import { describe, expect, it } from "vitest";
import { billSummaryContentSchema, buildBillSummaryContent } from "@/domain/printing/bill-summary";

describe("buildBillSummaryContent", () => {
  const baseInput = {
    restaurantName: "MITIZ Boutique de Carnes",
    tableNumber: "1",
    waiterName: "Fulano",
    guestCount: 2,
    items: [{ label: "2x Porção de Anjo", quantity: 2, lineTotal: "R$ 80,00" }],
    subtotal: "R$ 80,00",
    serviceCharge: null,
    discount: null,
    total: "R$ 80,00",
    perPersonShares: ["R$ 40,00", "R$ 40,00"],
    payments: [],
    paidAmount: "R$ 0,00",
    balance: "R$ 80,00",
  };

  it("monta um conteúdo válido conforme o schema", () => {
    const content = buildBillSummaryContent(baseInput);
    expect(() => billSummaryContentSchema.parse(content)).not.toThrow();
    expect(content.type).toBe("BILL_SUMMARY");
    expect(content.items).toHaveLength(1);
  });

  it("taxa/desconto ficam null quando nenhum foi aplicado (distinto de R$ 0,00)", () => {
    const content = buildBillSummaryContent(baseInput);
    expect(content.serviceCharge).toBeNull();
    expect(content.discount).toBeNull();
  });

  it("carrega pagamentos já registrados quando existem", () => {
    const content = buildBillSummaryContent({
      ...baseInput,
      payments: [{ methodName: "Dinheiro", amount: "R$ 30,00", guestName: null }],
      paidAmount: "R$ 30,00",
      balance: "R$ 50,00",
    });
    expect(content.payments).toHaveLength(1);
    expect(content.payments[0]?.methodName).toBe("Dinheiro");
    expect(content.balance).toBe("R$ 50,00");
  });

  it("usa a hora informada, ou a atual se omitida", () => {
    const fixedDate = new Date("2026-08-11T18:00:00.000Z");
    const content = buildBillSummaryContent({ ...baseInput, generatedAt: fixedDate });
    expect(content.generatedAt).toBe(fixedDate.toISOString());
  });
});
