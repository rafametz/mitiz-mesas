import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePrinterToken, hashPrinterToken } from "@/lib/printing/token";

describe("token do agente local", () => {
  it("gera tokens diferentes a cada chamada", () => {
    expect(generatePrinterToken()).not.toBe(generatePrinterToken());
  });

  it("hash é determinístico (mesmo token -> mesmo hash)", () => {
    const token = generatePrinterToken();
    expect(hashPrinterToken(token)).toBe(hashPrinterToken(token));
  });

  it("hash bate com SHA-256 puro do token", () => {
    const token = "token-de-teste";
    expect(hashPrinterToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("nunca guarda o token em texto puro no hash (não é igual)", () => {
    const token = generatePrinterToken();
    expect(hashPrinterToken(token)).not.toBe(token);
  });
});
