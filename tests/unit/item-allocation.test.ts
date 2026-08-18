import { describe, expect, it } from "vitest";
import {
  buildItemPaymentStatuses,
  buildPayableLines,
  computeItemLineTotal,
  distributeAmountFifo,
  distributeUnitsFifo,
  InsufficientAmountError,
  InsufficientQuantityError,
  openAmountForItem,
  openUnitsForItem,
  paidAmountForItem,
  paidUnitsForItem,
  type PayableOrderItemInput,
} from "@/domain/payment/item-allocation";

// Pagamento por itens e rateio de consumo (ADR 0006) — mesmo racional de
// tests/unit/split.test.ts: puro, sem I/O, quem chama já buscou os dados.

function item(overrides: Partial<PayableOrderItemInput> = {}): PayableOrderItemInput {
  return {
    id: "item-1",
    productId: "prod-1",
    productNameAtOrder: "Chopp Pilsen",
    meatPoint: null,
    guestId: null,
    guestName: null,
    quantity: 1,
    unitPrice: "12.00",
    modifiers: [],
    openShareParts: null,
    createdAt: new Date("2026-08-15T12:00:00Z"),
    allocations: [],
    ...overrides,
  };
}

describe("paidAmountForItem / openAmountForItem", () => {
  it("alocação de pagamento estornado não conta como pago", () => {
    const chopp = item({
      quantity: 10,
      allocations: [
        { kind: "UNITS", quantity: 4, amount: "48.00", voided: false },
        { kind: "UNITS", quantity: 3, amount: "36.00", voided: true }, // estornado
      ],
    });
    expect(paidAmountForItem(chopp).toString()).toBe("48");
    expect(openAmountForItem(chopp).toString()).toBe("72"); // 120 - 48
    expect(paidUnitsForItem(chopp)).toBe(4);
    expect(openUnitsForItem(chopp)).toBe(6); // 10 - 4
  });

  it("nunca fica negativo mesmo com soma de alocações passando do total (defesa)", () => {
    const over = item({
      quantity: 1,
      unitPrice: "10.00",
      allocations: [{ kind: "AMOUNT", quantity: null, amount: "10.00", voided: false }],
    });
    expect(openAmountForItem(over).toString()).toBe("0");
  });
});

describe("buildPayableLines", () => {
  it("agrupa itens de mesma linha (produto+adicionais+pessoa) com quantity > 1 lançados em pedidos diferentes", () => {
    const a = item({ id: "a", quantity: 4, createdAt: new Date("2026-08-15T12:00:00Z") });
    const b = item({ id: "b", quantity: 6, createdAt: new Date("2026-08-15T13:00:00Z") });
    const lines = buildPayableLines([a, b]);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.type).toBe("units");
    if (line.type !== "units") throw new Error("esperado units");
    expect(line.totalQuantity).toBe(10);
    expect(line.openQuantity).toBe(10);
    // Mais antiga primeiro (FIFO) — item "a" antes de "b".
    expect(line.sourceItems.map((s) => s.itemId)).toEqual(["a", "b"]);
  });

  it("agrupa item lançado quantity=1 em pedidos diferentes (correção de bug 2026-08-15: chope lançado uma unidade de cada vez não juntava)", () => {
    const a = item({ id: "a", quantity: 1, createdAt: new Date("2026-08-15T12:00:00Z") });
    const b = item({ id: "b", quantity: 1, createdAt: new Date("2026-08-15T13:00:00Z") });
    const lines = buildPayableLines([a, b]);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.type).toBe("units");
    if (line.type !== "units") throw new Error("esperado units");
    expect(line.totalQuantity).toBe(2);
    expect(line.sourceItems.map((s) => s.itemId)).toEqual(["a", "b"]);
  });

  it("item único (sem outro igual) continua sendo linha simples, não uma unidade só", () => {
    const single = item({ id: "a", quantity: 1, productNameAtOrder: "Porção Mista", unitPrice: "120.00" });
    const lines = buildPayableLines([single]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.type).toBe("single");
  });

  it("item já dividido agrupa com outro igual ainda fechado, virando linha de unidades com fração do total (revisão 2026-08-16)", () => {
    const divided = item({
      id: "a",
      quantity: 1,
      productNameAtOrder: "Porção Mista",
      unitPrice: "120.00",
      openShareParts: 4,
    });
    const untouched = item({ id: "b", quantity: 1, productNameAtOrder: "Porção Mista", unitPrice: "120.00" });
    const lines = buildPayableLines([divided, untouched]);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.type).toBe("units");
    if (line.type !== "units") throw new Error("esperado units");
    // Saldo do GRUPO (240) dividido pelo denominador vigente (4) — não
    // só o saldo da linha que carrega o openShareParts.
    expect(line.openAmount.toString()).toBe("240");
    expect(line.share!.nominalPartValue.toString()).toBe("60");
  });

  it("dividir também funciona pra item com uma única linha de origem (sem duplicata), mesmo comportamento de antes", () => {
    const divided = item({
      id: "a",
      quantity: 1,
      productNameAtOrder: "Porção Mista",
      unitPrice: "120.00",
      openShareParts: 4,
      allocations: [{ kind: "AMOUNT", quantity: null, amount: "30.00", voided: false }],
    });
    const lines = buildPayableLines([divided]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.type).toBe("single");
    if (lines[0]!.type !== "single") throw new Error("esperado single");
    expect(lines[0]!.share!.nominalPartValue.toString()).toBe("22.5"); // (120-30)/4
  });

  it("item totalmente pago some da lista de seleção", () => {
    const paid = item({
      quantity: 1,
      unitPrice: "35.00",
      allocations: [{ kind: "AMOUNT", quantity: null, amount: "35.00", voided: false }],
    });
    expect(buildPayableLines([paid])).toHaveLength(0);
  });

  it("expõe partes nominais de item dividido, calculadas sobre o saldo aberto", () => {
    const divided = item({
      quantity: 1,
      unitPrice: "120.00",
      openShareParts: 4,
      allocations: [{ kind: "AMOUNT", quantity: null, amount: "30.00", voided: false }],
    });
    const [line] = buildPayableLines([divided]);
    expect(line!.type).toBe("single");
    if (line!.type !== "single") throw new Error("esperado single");
    expect(line!.openAmount.toString()).toBe("90"); // 120 - 30
    // Saldo aberto (90) dividido pelas partes vigentes (4) — não pelo
    // total original.
    expect(line!.share!.nominalPartValue.toString()).toBe("22.5");
  });

  it("linha de unidades (quantity > 1 numa única linha) também pode estar dividida ao mesmo tempo em que oferece o stepper", () => {
    const chopes = item({ quantity: 8, unitPrice: "12.00", openShareParts: 4 });
    const [line] = buildPayableLines([chopes]);
    expect(line!.type).toBe("units");
    if (line!.type !== "units") throw new Error("esperado units");
    expect(line!.totalQuantity).toBe(8);
    expect(line!.share!.nominalPartValue.toString()).toBe("24"); // 96 / 4
  });
});

describe("distributeAmountFifo", () => {
  const sources = [
    { itemId: "a", openAmount: computeItemLineTotal(item({ unitPrice: "120.00" })) },
    { itemId: "b", openAmount: computeItemLineTotal(item({ unitPrice: "120.00" })) },
  ];

  it("consome a linha mais antiga até esgotar, só então passa pra próxima", () => {
    const result = distributeAmountFifo(computeItemLineTotal(item({ unitPrice: "180.00" })), sources);
    expect(result.map((r) => ({ orderItemId: r.orderItemId, amount: r.amount.toString() }))).toEqual([
      { orderItemId: "a", amount: "120" },
      { orderItemId: "b", amount: "60" },
    ]);
  });

  it("uma parte que cabe inteira na primeira linha não toca a segunda", () => {
    const result = distributeAmountFifo(computeItemLineTotal(item({ unitPrice: "60.00" })), sources);
    expect(result).toEqual([{ orderItemId: "a", amount: expect.anything() }]);
  });

  it("rejeita pedir mais do que a soma disponível", () => {
    expect(() => distributeAmountFifo(computeItemLineTotal(item({ unitPrice: "999.00" })), sources)).toThrow(
      InsufficientAmountError,
    );
  });

  it("rejeita valor zero ou negativo", () => {
    expect(() => distributeAmountFifo(computeItemLineTotal(item({ unitPrice: "0.00" })), sources)).toThrow(
      InsufficientAmountError,
    );
  });
});

describe("distributeUnitsFifo", () => {
  const sources = [
    { itemId: "a", openQuantity: 4, unitPrice: computeItemLineTotal(item({ quantity: 1 })) },
    { itemId: "b", openQuantity: 6, unitPrice: computeItemLineTotal(item({ quantity: 1 })) },
  ];

  it("consome a linha mais antiga primeiro, só passando pra próxima quando esgota", () => {
    const result = distributeUnitsFifo(5, sources);
    expect(result).toEqual([
      { orderItemId: "a", quantity: 4, amount: expect.anything() },
      { orderItemId: "b", quantity: 1, amount: expect.anything() },
    ]);
  });

  it("rejeita pedir mais do que a soma disponível", () => {
    expect(() => distributeUnitsFifo(11, sources)).toThrow(InsufficientQuantityError);
  });

  it("rejeita quantidade zero ou negativa", () => {
    expect(() => distributeUnitsFifo(0, sources)).toThrow(InsufficientQuantityError);
  });
});

describe("buildItemPaymentStatuses", () => {
  it("mostra item totalmente pago (diferente de buildPayableLines, que o esconde)", () => {
    const paid = item({
      id: "x",
      quantity: 1,
      unitPrice: "35.00",
      allocations: [{ kind: "AMOUNT", quantity: null, amount: "35.00", voided: false }],
    });
    const statuses = buildItemPaymentStatuses([paid]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.openAmount.toString()).toBe("0");
    expect(statuses[0]!.paidAmount.toString()).toBe("35");
  });

  it("agrupa o mesmo produto lançado em pedidos diferentes numa única linha (correção de bug 2026-08-15: painel mostrava duas vezes)", () => {
    const a = item({ id: "a", quantity: 4, createdAt: new Date("2026-08-15T12:00:00Z") });
    const b = item({ id: "b", quantity: 4, createdAt: new Date("2026-08-15T13:00:00Z") });
    const statuses = buildItemPaymentStatuses([a, b]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.units).toEqual({ total: 8, paid: 0, open: 8 });
    expect(statuses[0]!.lineTotal.toString()).toBe("96"); // 8 x 12.00
  });

  it("soma pago/aberto entre as linhas de origem do grupo (unidade paga numa linha, saldo reflete o total)", () => {
    const a = item({
      id: "a",
      quantity: 4,
      allocations: [{ kind: "UNITS", quantity: 2, amount: "24.00", voided: false }],
    });
    const b = item({ id: "b", quantity: 4 });
    const statuses = buildItemPaymentStatuses([a, b]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.units).toEqual({ total: 8, paid: 2, open: 6 });
    expect(statuses[0]!.paidAmount.toString()).toBe("24");
  });

  it("mostra o denominador vigente do grupo, mesmo com mais de uma linha de origem", () => {
    const a = item({
      id: "a",
      quantity: 1,
      productNameAtOrder: "Porção Mista",
      unitPrice: "120.00",
      openShareParts: 4,
      createdAt: new Date("2026-08-16T12:00:00Z"),
    });
    const b = item({
      id: "b",
      quantity: 1,
      productNameAtOrder: "Porção Mista",
      unitPrice: "120.00",
      createdAt: new Date("2026-08-16T13:00:00Z"),
    });
    const statuses = buildItemPaymentStatuses([a, b]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.openShareParts).toBe(4);
  });
});
