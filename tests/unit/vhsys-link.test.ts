import { describe, expect, it } from "vitest";
import { InvalidVhsysProductIdError, parseVhsysProductId } from "@/domain/product/vhsys-link";

describe("parseVhsysProductId", () => {
  it("string vazia devolve null (desvincula)", () => {
    expect(parseVhsysProductId("")).toBeNull();
    expect(parseVhsysProductId("   ")).toBeNull();
  });

  it("aceita inteiro positivo, ignorando espaços nas pontas", () => {
    expect(parseVhsysProductId("123456")).toBe(123456);
    expect(parseVhsysProductId("  42  ")).toBe(42);
  });

  it("rejeita zero e negativo", () => {
    expect(() => parseVhsysProductId("0")).toThrow(InvalidVhsysProductIdError);
    expect(() => parseVhsysProductId("-5")).toThrow(InvalidVhsysProductIdError);
  });

  it("rejeita valor não numérico ou decimal", () => {
    expect(() => parseVhsysProductId("abc")).toThrow(InvalidVhsysProductIdError);
    expect(() => parseVhsysProductId("12.5")).toThrow(InvalidVhsysProductIdError);
    expect(() => parseVhsysProductId("12abc")).toThrow(InvalidVhsysProductIdError);
  });
});
