// AuditLog.metadata varia por ação (motivo, valor, forma de pagamento...)
// mas é sempre um objeto raso (chave -> string/number/boolean/null), nunca
// aninhado — todo `writeAuditLog(...)` do código só grava isso. Formata
// pra exibição genérica na tela de auditoria sem precisar de um
// dicionário por ação: transforma "camelCase" em rótulo capitalizado
// ("waivedReason" -> "Waived reason").
export function formatAuditMetadataEntries(
  metadata: unknown,
): { label: string; value: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];

  return Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
      value: String(value),
    }));
}
