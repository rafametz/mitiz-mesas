import { describe, expect, it } from "vitest";
import {
  REALTIME_EVENT,
  restaurantTablesChannel,
  sectorChannel,
  tableChannel,
} from "@/lib/realtime/channels";

// Puro, sem I/O — só garante que publisher (servidor) e assinante
// (cliente) nunca podem divergir no formato do nome do canal, já que os
// dois usam estas mesmas funções.
describe("nomes de canal do Realtime", () => {
  it("gera um canal por mesa", () => {
    expect(tableChannel("mesa-1")).toBe("table:mesa-1");
  });

  it("gera um canal por restaurante para a visão geral de mesas", () => {
    expect(restaurantTablesChannel("rest-1")).toBe("restaurant:rest-1:tables");
  });

  it("gera um canal por setor de produção", () => {
    expect(sectorChannel("setor-1")).toBe("sector:setor-1");
  });

  it("mesas diferentes nunca colidem no mesmo canal", () => {
    expect(tableChannel("mesa-1")).not.toBe(tableChannel("mesa-2"));
  });

  it("o evento de broadcast é um nome fixo e não vazio", () => {
    expect(REALTIME_EVENT).toBeTruthy();
  });
});
