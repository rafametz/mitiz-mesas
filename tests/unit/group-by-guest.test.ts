import { describe, expect, it } from "vitest";
import { groupByGuestName } from "@/domain/guest/group-by-guest";

// Agrupamento por pessoa (2026-08-20, pedido do usuário) — usado tanto na
// seleção de pagamento quanto no painel "Itens" da tela de pagamentos.

type Line = { label: string; guestName: string | null };

function line(label: string, guestName: string | null = null): Line {
  return { label, guestName };
}

describe("groupByGuestName", () => {
  it("agrupa por pessoa em ordem alfabética, consumo geral sempre por último", () => {
    const groups = groupByGuestName([
      line("Chopp Pilsen", "Rafael"),
      line("Porção de Ancho", null),
      line("Água", "Mônica"),
      line("Chopp Session IPA", "Rafael"),
    ]);

    expect(groups.map((g) => g.guestName)).toEqual(["Mônica", "Rafael", null]);
    expect(groups[0]!.items.map((i) => i.label)).toEqual(["Água"]);
    expect(groups[1]!.items.map((i) => i.label)).toEqual(["Chopp Pilsen", "Chopp Session IPA"]);
    expect(groups[2]!.items.map((i) => i.label)).toEqual(["Porção de Ancho"]);
  });

  it("preserva a ordem original dos itens dentro de cada grupo", () => {
    const groups = groupByGuestName([
      line("Zebra", "Ana"),
      line("Abacaxi", "Ana"),
    ]);
    expect(groups[0]!.items.map((i) => i.label)).toEqual(["Zebra", "Abacaxi"]);
  });

  it("sem nenhuma pessoa vinculada, tudo cai num único grupo 'consumo geral'", () => {
    const groups = groupByGuestName([line("Chopp Pilsen"), line("Porção de Ancho")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.guestName).toBeNull();
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("sem nenhum item de consumo geral, não cria grupo vazio pra ele", () => {
    const groups = groupByGuestName([line("Chopp Pilsen", "Rafael")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.guestName).toBe("Rafael");
  });

  it("lista vazia retorna nenhum grupo", () => {
    expect(groupByGuestName([])).toEqual([]);
  });

  it("nomes iguais (duas linhas da mesma pessoa) caem no mesmo grupo, não duplicam", () => {
    const groups = groupByGuestName([
      line("Chopp Pilsen", "Rafael"),
      line("Água", "Rafael"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items).toHaveLength(2);
  });
});
