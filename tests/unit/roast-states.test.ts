import { describe, expect, it } from "vitest";
import { canTransitionRoastReservation, isRoastReservationEditable } from "@/domain/roast/states";

describe("canTransitionRoastReservation", () => {
  it("permite PENDING -> DELIVERED e PENDING -> CANCELLED", () => {
    expect(canTransitionRoastReservation("PENDING", "DELIVERED")).toBe(true);
    expect(canTransitionRoastReservation("PENDING", "CANCELLED")).toBe(true);
  });

  it("DELIVERED e CANCELLED são estados terminais (sem reabertura, decisão do usuário 2026-09-29)", () => {
    expect(canTransitionRoastReservation("DELIVERED", "PENDING")).toBe(false);
    expect(canTransitionRoastReservation("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionRoastReservation("CANCELLED", "PENDING")).toBe(false);
    expect(canTransitionRoastReservation("CANCELLED", "DELIVERED")).toBe(false);
  });
});

describe("isRoastReservationEditable", () => {
  it("só PENDING pode ser editada/cancelada", () => {
    expect(isRoastReservationEditable("PENDING")).toBe(true);
    expect(isRoastReservationEditable("DELIVERED")).toBe(false);
    expect(isRoastReservationEditable("CANCELLED")).toBe(false);
  });
});
