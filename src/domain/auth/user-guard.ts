// Regra de segurança pra edição de usuário (Módulo de Administração de
// usuários, pedido do usuário 2026-08-13): nunca permitir uma mudança que
// deixe o restaurante sem nenhum administrador ativo — cobre tanto "removi
// meu próprio acesso de admin sem querer" quanto "desativei sem perceber o
// último admin que sobrava". Pura: quem chama já contou quantos OUTROS
// administradores ativos existem (sem contar o usuário sendo editado).
export function wouldLeaveNoActiveAdmin(params: {
  isCurrentlyAdmin: boolean;
  willBeAdmin: boolean;
  willBeActive: boolean;
  otherActiveAdminCount: number;
}): boolean {
  // Não era admin — a contagem de admins ativos não depende dele.
  if (!params.isCurrentlyAdmin) return false;

  // Continua admin ativo depois da mudança — nada muda na contagem.
  if (params.willBeAdmin && params.willBeActive) return false;

  // Deixou de ser admin ativo (perdeu o perfil ou foi desativado) — só é
  // seguro se sobrar pelo menos outro admin ativo.
  return params.otherActiveAdminCount === 0;
}
