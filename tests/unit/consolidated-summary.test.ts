import { describe, expect, it } from "vitest";
import {
  buildConsolidatedSummary,
  type ConsolidatedItemInput,
} from "@/domain/order/consolidated-summary";

function item(overrides: Partial<ConsolidatedItemInput> = {}): ConsolidatedItemInput {
  return {
    productId: "prod-bife",
    productNameAtOrder: "Bife ancho",
    meatPoint: null,
    quantity: 1,
    unitPrice: "50.00",
    status: "SENT",
    modifiers: [],
    ...overrides,
  };
}

describe("buildConsolidatedSummary", () => {
  it("junta o mesmo item vindo de pedidos diferentes numa linha só", () => {
    const summary = buildConsolidatedSummary([
      item({ quantity: 1 }), // pedido 1
      item({ quantity: 1 }), // pedido 3 — mesmo produto, mesma configuração
    ]);

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]!.quantity).toBe(2);
    expect(summary.lines[0]!.lineTotal.toString()).toBe("100");
    expect(summary.total.toString()).toBe("100");
  });

  it("não junta pontos da carne diferentes do mesmo produto", () => {
    const summary = buildConsolidatedSummary([
      item({ meatPoint: "MAL_PASSADO" }),
      item({ meatPoint: "BEM_PASSADO" }),
    ]);

    expect(summary.lines).toHaveLength(2);
    expect(summary.lines.map((l) => l.quantity)).toEqual([1, 1]);
  });

  it("não junta itens com adicionais diferentes", () => {
    const summary = buildConsolidatedSummary([
      item({
        modifiers: [
          { modifierNameAtOrder: "Manteiga extra", priceDeltaAtOrder: "3.00", quantity: 1 },
        ],
      }),
      item({ modifiers: [] }),
    ]);

    expect(summary.lines).toHaveLength(2);
  });

  it("soma o preço dos adicionais na linha", () => {
    const summary = buildConsolidatedSummary([
      item({
        quantity: 2,
        modifiers: [
          { modifierNameAtOrder: "Manteiga extra", priceDeltaAtOrder: "3.00", quantity: 1 },
        ],
      }),
    ]);

    // (50 + 3) * 2 = 106 — mesma fórmula do subtotal oficial da comanda.
    expect(summary.lines[0]!.lineTotal.toString()).toBe("106");
    // Unitário = total da linha / quantidade (produto + adicional já
    // embutidos): 106 / 2 = 53.
    expect(summary.lines[0]!.unitPrice.toString()).toBe("53");
  });

  it("calcula o valor unitário mesmo quando o mesmo item vem de pedidos diferentes", () => {
    const summary = buildConsolidatedSummary([item({ quantity: 1 }), item({ quantity: 1 })]);

    expect(summary.lines[0]!.quantity).toBe(2);
    expect(summary.lines[0]!.unitPrice.toString()).toBe("50");
  });

  it("ignora item cancelado, mas conta cancelamento só solicitado", () => {
    const summary = buildConsolidatedSummary([
      item({ status: "CANCELLED" }),
      item({ status: "CANCELLATION_REQUESTED" }),
    ]);

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]!.quantity).toBe(1);
  });

  it("lista vazia gera resumo vazio", () => {
    const summary = buildConsolidatedSummary([]);
    expect(summary.lines).toHaveLength(0);
    expect(summary.total.toString()).toBe("0");
  });
});
