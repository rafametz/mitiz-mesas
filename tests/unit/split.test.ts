import { describe, expect, it } from "vitest";
import { isValidCustomSplit, splitByPerson, splitEqually } from "@/domain/service-session/split";

describe("splitEqually", () => {
  it("divide sem sobra quando o total é múltiplo exato", () => {
    const parts = splitEqually("90.00", 3);
    expect(parts.map((p) => p.toString())).toEqual(["30", "30", "30"]);
  });

  it("não perde nem sobra centavo quando não divide exato (regra determinística)", () => {
    // R$100,00 / 3 = 33,33 33,33 33,33 -> falta 1 centavo. Vai pra
    // primeira parte, sempre a mesma posição (determinístico).
    const parts = splitEqually("100.00", 3);
    expect(parts.map((p) => p.toString())).toEqual(["33.34", "33.33", "33.33"]);
    const total = parts.reduce((sum, p) => sum.add(p), parts[0]!.sub(parts[0]!));
    expect(total.toString()).toBe("100");
  });

  it("rejeita número de partes inválido", () => {
    expect(() => splitEqually("100", 0)).toThrow();
    expect(() => splitEqually("100", -1)).toThrow();
    expect(() => splitEqually("100", 1.5)).toThrow();
  });
});

describe("splitByPerson", () => {
  const guests = [
    { id: "g1", name: "Ana" },
    { id: "g2", name: "Beto" },
  ];

  it("cada um paga o que consumiu, sem consumo geral", () => {
    const result = splitByPerson(
      [
        { guestId: "g1", label: "1x Bife", lineTotal: "50.00" },
        { guestId: "g2", label: "1x Chope", lineTotal: "12.00" },
      ],
      guests,
    );
    expect(result.find((r) => r.guestId === "g1")!.amount.toString()).toBe("50");
    expect(result.find((r) => r.guestId === "g2")!.amount.toString()).toBe("12");
  });

  it("consumo geral (sem pessoa) é rateado igualmente entre todos", () => {
    const result = splitByPerson(
      [
        { guestId: "g1", label: "1x Bife", lineTotal: "50.00" },
        { guestId: null, label: "1x Entrada da mesa", lineTotal: "20.00" },
      ],
      guests,
    );
    const ana = result.find((r) => r.guestId === "g1")!;
    const beto = result.find((r) => r.guestId === "g2")!;
    // Ana: 50 (dela) + 10 (metade do geral) = 60. Beto: 0 + 10 = 10.
    expect(ana.amount.toString()).toBe("60");
    expect(beto.amount.toString()).toBe("10");
    expect(ana.amount.add(beto.amount).toString()).toBe("70");
  });

  it("item de pessoa que não está mais na lista de convidados vira consumo geral", () => {
    const result = splitByPerson(
      [{ guestId: "nao-existe-mais", label: "1x Bife", lineTotal: "20.00" }],
      guests,
    );
    expect(result.find((r) => r.guestId === "g1")!.amount.toString()).toBe("10");
    expect(result.find((r) => r.guestId === "g2")!.amount.toString()).toBe("10");
  });

  it("rejeita dividir por pessoa sem nenhuma pessoa cadastrada", () => {
    expect(() => splitByPerson([], [])).toThrow();
  });
});

describe("isValidCustomSplit", () => {
  it("aceita quando a soma bate exatamente com o total", () => {
    expect(isValidCustomSplit("100.00", ["40.00", "60.00"])).toBe(true);
  });

  it("rejeita quando a soma diverge, mesmo por 1 centavo", () => {
    expect(isValidCustomSplit("100.00", ["40.00", "59.99"])).toBe(false);
    expect(isValidCustomSplit("100.00", ["40.00", "60.01"])).toBe(false);
  });
});
