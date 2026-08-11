import { describe, expect, it } from "vitest";
import { deriveGuestParticipation } from "@/domain/service-session/guest-participation";

// Cenário do enunciado (revisão 2026-08-10): mesa de 4 pessoas, consumo de
// R$400 rateado igualmente (R$100 cada), uma paga a parte dela e some da
// conta — as outras continuam.
describe("deriveGuestParticipation", () => {
  const guests = [
    { id: "g1", name: "Ana", status: "ACTIVE" as const },
    { id: "g2", name: "Beto", status: "SETTLED" as const },
  ];

  it("calcula consumo, pago e saldo por pessoa", () => {
    const result = deriveGuestParticipation(
      guests,
      [
        { guestId: "g1", label: "1x Bife", lineTotal: "50.00" },
        { guestId: "g2", label: "1x Chope", lineTotal: "12.00" },
        { guestId: null, label: "1x Entrada da mesa", lineTotal: "20.00" },
      ],
      [{ guestId: "g2", amount: "22.00" }],
    );

    const ana = result.find((r) => r.guestId === "g1")!;
    const beto = result.find((r) => r.guestId === "g2")!;

    // Ana: 50 (dela) + 10 (metade do geral) = 60, sem pagamento -> saldo 60.
    expect(ana.consumption.toString()).toBe("60");
    expect(ana.paid.toString()).toBe("0");
    expect(ana.balance.toString()).toBe("60");
    expect(ana.status).toBe("ACTIVE");

    // Beto: 12 + 10 = 22, pagou 22 -> saldo 0, já SETTLED.
    expect(beto.consumption.toString()).toBe("22");
    expect(beto.paid.toString()).toBe("22");
    expect(beto.balance.toString()).toBe("0");
    expect(beto.status).toBe("SETTLED");
  });

  it("pagamentos gerais (sem guestId) não entram no total de nenhuma pessoa", () => {
    const result = deriveGuestParticipation(
      guests,
      [{ guestId: "g1", label: "1x Bife", lineTotal: "50.00" }],
      [{ guestId: null, amount: "50.00" }],
    );
    expect(result.every((r) => r.paid.toString() === "0")).toBe(true);
  });

  it("saldo pode ficar negativo quando a pessoa paga mais do que consumiu", () => {
    const result = deriveGuestParticipation(
      guests,
      [{ guestId: "g1", label: "1x Bife", lineTotal: "50.00" }],
      [{ guestId: "g1", amount: "70.00" }],
    );
    expect(result.find((r) => r.guestId === "g1")!.balance.toString()).toBe("-20");
  });

  it("retorna vazio sem pessoas cadastradas", () => {
    expect(deriveGuestParticipation([], [], [])).toEqual([]);
  });
});
