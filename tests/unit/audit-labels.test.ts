import { describe, expect, it } from "vitest";
import { auditActionLabel } from "@/domain/audit/labels";
import { formatAuditMetadataEntries } from "@/domain/audit/metadata";

describe("auditActionLabel", () => {
  it("traduz uma ação conhecida", () => {
    expect(auditActionLabel("payment.registered")).toBe("Pagamento registrado");
  });

  it("devolve o valor cru quando a ação não está no catálogo", () => {
    expect(auditActionLabel("algo.novo")).toBe("algo.novo");
  });
});

describe("formatAuditMetadataEntries", () => {
  it("formata chaves camelCase em rótulos capitalizados", () => {
    const entries = formatAuditMetadataEntries({ waivedReason: "Cliente pediu", amount: "50.00" });
    expect(entries).toEqual([
      { label: "Waived Reason", value: "Cliente pediu" },
      { label: "Amount", value: "50.00" },
    ]);
  });

  it("ignora valores nulos, undefined e string vazia", () => {
    const entries = formatAuditMetadataEntries({ reason: null, guestId: undefined, notes: "" });
    expect(entries).toEqual([]);
  });

  it("devolve lista vazia para metadata ausente", () => {
    expect(formatAuditMetadataEntries(null)).toEqual([]);
    expect(formatAuditMetadataEntries(undefined)).toEqual([]);
  });

  it("converte valores booleanos e numéricos em string", () => {
    const entries = formatAuditMetadataEntries({ waived: true, percent: 10 });
    expect(entries).toEqual([
      { label: "Waived", value: "true" },
      { label: "Percent", value: "10" },
    ]);
  });
});
