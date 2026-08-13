// Rótulos em português das ações registradas em AuditLog.action (Módulo 9,
// tela de auditoria) — catálogo fechado, um valor por chamada de
// writeAuditLog no código (src/application/**). Nomes técnicos em inglês
// no banco, texto de interface em português (CLAUDE.md seção 13).
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "order_item.cancellation_requested": "Cancelamento de item solicitado",
  "order_item.cancelled": "Item cancelado",
  "discount.applied": "Desconto aplicado",
  "discount.voided": "Desconto anulado",
  "service_charge.applied": "Taxa de serviço aplicada",
  "service_charge.waived": "Taxa de serviço retirada",
  "service_session.closing_requested": "Fechamento solicitado",
  "service_session.closing_cancelled": "Solicitação de fechamento cancelada",
  "service_session.closed": "Atendimento finalizado",
  "service_session.closed_by_migration": "Atendimento finalizado (migração)",
  "payment.registered": "Pagamento registrado",
  "payment.voided": "Pagamento estornado",
  "guest.settled": "Pessoa marcada como quitada",
  "guest.reopened": "Pessoa reaberta",
};

// Ação registrada antes deste catálogo existir (ou por uma versão futura
// do código ainda não documentada aqui) — mostra o valor técnico cru em
// vez de esconder a linha (CLAUDE.md: não esconder falha/dado, só não
// travar a tela por causa disso).
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
