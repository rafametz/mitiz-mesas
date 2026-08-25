import { describe, expect, it } from "vitest";
import { buildSalesByPeriod } from "@/domain/reports/sales-by-period";
import { buildSalesByProduct } from "@/domain/reports/sales-by-product";
import { buildTableOpenDuration } from "@/domain/reports/table-open-duration";
import { buildArrivalsByHour, buildRevenueByOrderHour } from "@/domain/reports/peak-hours";

describe("buildSalesByPeriod", () => {
  it("agrupa por dia do fechamento (América/Sao_Paulo), soma total e conta atendimentos", () => {
    const result = buildSalesByPeriod([
      { closedAt: new Date("2026-08-11T14:00:00-03:00"), totalAmount: "100.00" },
      { closedAt: new Date("2026-08-11T20:00:00-03:00"), totalAmount: "50.00" },
      { closedAt: new Date("2026-08-12T13:00:00-03:00"), totalAmount: "80.00" },
    ]);

    expect(result.days).toEqual([
      { date: "2026-08-11", sessionsCount: 2, total: expect.anything() },
      { date: "2026-08-12", sessionsCount: 1, total: expect.anything() },
    ]);
    expect(result.days[0]?.total.toString()).toBe("150");
    expect(result.days[1]?.total.toString()).toBe("80");
    expect(result.total.toString()).toBe("230");
    expect(result.sessionsCount).toBe(3);
  });

  it("um atendimento que fecha logo após meia-noite conta no dia do fechamento, não da abertura", () => {
    // 23h50 de 10/08 (SP) até 00h10 de 11/08 (SP) -> fecha às 03h10 UTC do dia 11.
    const result = buildSalesByPeriod([
      { closedAt: new Date("2026-08-11T00:10:00-03:00"), totalAmount: "40.00" },
    ]);
    expect(result.days).toEqual([{ date: "2026-08-11", sessionsCount: 1, total: expect.anything() }]);
  });

  it("lista vazia devolve total zero sem lançar erro", () => {
    const result = buildSalesByPeriod([]);
    expect(result.days).toEqual([]);
    expect(result.total.toString()).toBe("0");
    expect(result.sessionsCount).toBe(0);
  });
});

describe("buildSalesByProduct", () => {
  const baseItem = {
    productId: "p1",
    productNameAtOrder: "Bife Ancho",
    quantity: 2,
    unitPrice: "40.00",
    status: "DELIVERED" as const,
    modifiers: [],
  };

  it("soma quantidade e valor por produto, ordenado por faturamento desc", () => {
    const result = buildSalesByProduct([
      baseItem,
      { ...baseItem, quantity: 1 },
      { ...baseItem, productId: "p2", productNameAtOrder: "Água", quantity: 5, unitPrice: "5.00" },
    ]);

    expect(result.lines[0]).toMatchObject({ productId: "p1", productName: "Bife Ancho", quantity: 3 });
    expect(result.lines[0]?.total.toString()).toBe("120");
    expect(result.lines[1]).toMatchObject({ productId: "p2", quantity: 5 });
    expect(result.lines[1]?.total.toString()).toBe("25");
    expect(result.total.toString()).toBe("145");
  });

  it("ignora item CANCELLED, mas conta CANCELLATION_REQUESTED", () => {
    const result = buildSalesByProduct([
      { ...baseItem, status: "CANCELLED" },
      { ...baseItem, quantity: 1, status: "CANCELLATION_REQUESTED" },
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.quantity).toBe(1);
  });

  it("soma o valor dos adicionais no total do produto", () => {
    const result = buildSalesByProduct([
      {
        ...baseItem,
        quantity: 1,
        modifiers: [{ priceDeltaAtOrder: "3.00", quantity: 2 }],
      },
    ]);
    // 40.00 + (3.00 * 2) = 46.00
    expect(result.lines[0]?.total.toString()).toBe("46");
  });
});

describe("buildTableOpenDuration", () => {
  it("calcula duração em minutos e ordena do mais demorado pro mais rápido", () => {
    const result = buildTableOpenDuration([
      {
        id: "s1",
        tableNumber: "1",
        waiterName: "Rafael",
        openedAt: new Date("2026-08-11T13:00:00-03:00"),
        closedAt: new Date("2026-08-11T14:30:00-03:00"),
      },
      {
        id: "s2",
        tableNumber: "2",
        waiterName: "Rafael",
        openedAt: new Date("2026-08-11T13:00:00-03:00"),
        closedAt: new Date("2026-08-11T15:00:00-03:00"),
      },
    ]);

    expect(result.lines[0]?.id).toBe("s2");
    expect(result.lines[0]?.durationMinutes).toBe(120);
    expect(result.lines[1]?.durationMinutes).toBe(90);
    expect(result.averageMinutes).toBe(105);
  });

  it("lista vazia devolve média zero", () => {
    expect(buildTableOpenDuration([])).toEqual({ lines: [], averageMinutes: 0 });
  });
});

describe("buildArrivalsByHour", () => {
  it("sempre devolve 24 baldes, mesmo sem nenhum atendimento naquela hora", () => {
    const buckets = buildArrivalsByHour([]);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]).toMatchObject({ hour: 0, sessionsOpened: 0, guests: 0 });
  });

  it("agrupa pela hora local (América/Sao_Paulo) da abertura do atendimento", () => {
    const buckets = buildArrivalsByHour([
      { openedAt: new Date("2026-08-11T13:05:00-03:00"), guestCount: 2 },
      { openedAt: new Date("2026-08-11T13:45:00-03:00"), guestCount: 4 },
      { openedAt: new Date("2026-08-11T20:00:00-03:00"), guestCount: 3 },
    ]);

    const hour13 = buckets.find((b) => b.hour === 13);
    expect(hour13).toMatchObject({ sessionsOpened: 2, guests: 6 });

    const hour20 = buckets.find((b) => b.hour === 20);
    expect(hour20).toMatchObject({ sessionsOpened: 1, guests: 3 });
  });
});

describe("buildRevenueByOrderHour", () => {
  const baseItem = {
    quantity: 1,
    unitPrice: "20.00",
    status: "DELIVERED" as const,
    modifiers: [],
  };

  it("sempre devolve 24 baldes com revenue zero, mesmo sem nenhum item naquela hora", () => {
    const buckets = buildRevenueByOrderHour([]);
    expect(buckets).toHaveLength(24);
    expect(buckets[0]?.revenue.toString()).toBe("0");
  });

  it("agrupa pela hora local (América/Sao_Paulo) do lançamento do item, não da mesa como um todo", () => {
    // Mesma mesa (mesmo atendimento), dois itens lançados em horas
    // diferentes — cada um cai no próprio horário, não no da abertura.
    const buckets = buildRevenueByOrderHour([
      { ...baseItem, createdAt: new Date("2026-08-11T18:05:00-03:00"), unitPrice: "15.00" }, // chope
      { ...baseItem, createdAt: new Date("2026-08-11T19:10:00-03:00"), unitPrice: "15.00" }, // chope
    ]);

    const hour18 = buckets.find((b) => b.hour === 18);
    expect(hour18?.revenue.toString()).toBe("15");
    const hour19 = buckets.find((b) => b.hour === 19);
    expect(hour19?.revenue.toString()).toBe("15");
  });

  it("ignora item CANCELLED, mas conta CANCELLATION_REQUESTED", () => {
    const buckets = buildRevenueByOrderHour([
      { ...baseItem, createdAt: new Date("2026-08-11T18:00:00-03:00"), status: "CANCELLED" },
      {
        ...baseItem,
        createdAt: new Date("2026-08-11T18:00:00-03:00"),
        status: "CANCELLATION_REQUESTED",
      },
    ]);
    const hour18 = buckets.find((b) => b.hour === 18);
    expect(hour18?.revenue.toString()).toBe("20");
  });

  it("soma o valor dos adicionais na hora do item", () => {
    const buckets = buildRevenueByOrderHour([
      {
        ...baseItem,
        createdAt: new Date("2026-08-11T18:00:00-03:00"),
        modifiers: [{ priceDeltaAtOrder: "3.00", quantity: 2 }],
      },
    ]);
    // 20.00 + (3.00 * 2) = 26.00
    const hour18 = buckets.find((b) => b.hour === 18);
    expect(hour18?.revenue.toString()).toBe("26");
  });
});
