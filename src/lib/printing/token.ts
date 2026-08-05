import "server-only";
import { createHash, randomBytes } from "node:crypto";

// Token do agente local (docs/printing/architecture.md) — gerado uma vez,
// mostrado uma vez, nunca guardado em texto puro (mesmo racional de senha:
// só o hash SHA-256 fica no banco, em Printer.agentTokenHash).
export function generatePrinterToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashPrinterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
