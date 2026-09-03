import { daysAgoSaoPaulo, todaySaoPaulo } from "@/lib/datetime";

// Lê e valida o filtro De/Até compartilhado pelos 4 relatórios (revisão
// 2026-08-29, relato do usuário): antes, o campo "De" travava via `max`
// do HTML preso ao "Até" atual, impedindo digitar uma data fora de ordem
// enquanto os dois campos ainda estavam sendo ajustados. Agora a seleção
// fica livre nos dois campos — a validação vira uma mensagem de erro só
// no momento de filtrar, nunca um campo travado, e nunca roda a consulta
// do relatório com um intervalo invertido (que silenciosamente devolvia
// zero linhas, sem avisar nada de errado).
export function resolveReportDateRange(sp: { de?: string; ate?: string }): {
  from: string;
  to: string;
  invalid: boolean;
} {
  const from = sp.de ?? daysAgoSaoPaulo(6);
  const to = sp.ate ?? todaySaoPaulo();
  // Comparação de string funciona porque o formato é sempre "AAAA-MM-DD"
  // (ordem lexicográfica == ordem cronológica).
  return { from, to, invalid: from > to };
}
