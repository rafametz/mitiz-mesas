import "server-only";
import { REALTIME_EVENT } from "./channels";

// Publica "algo mudou" nos canais informados via a API REST de Broadcast do
// Supabase Realtime (POST simples, sem abrir/segurar WebSocket) — a forma
// recomendada para publicar a partir de um processo curto (server action),
// em vez de conectar/entrar no canal/enviar/desconectar a cada chamada.
// Ver ADR 0003 (docs/architecture/decisions/) para a decisão completa de
// arquitetura (canais públicos, payload sem dado de negócio).
//
// O payload nunca carrega dado financeiro/operacional — só um `type`
// textual. Quem assina (RealtimeRefresh) nunca lê o payload como dado, só
// usa a chegada do evento como gatilho para buscar de novo o estado real
// do servidor (router.refresh()) — regra 24 do CLAUDE.md: frontend nunca é
// a única camada, e aqui nem chega a ser fonte de leitura.
export async function publishChange(channels: string[], type: string): Promise<void> {
  if (channels.length === 0) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: channels.map((topic) => ({
          topic,
          event: REALTIME_EVENT,
          payload: { type },
          private: false,
        })),
      }),
    });
    if (!response.ok) {
      console.error(`[realtime] broadcast falhou (${response.status}) para ${channels.join(", ")}`);
    }
  } catch (error) {
    // Tempo real é reforço de UX (atualização automática), não a fonte da
    // verdade — a mutação já foi persistida com sucesso antes de chegar
    // aqui. Uma falha de rede ao publicar não pode derrubar uma operação
    // que já terminou; só registramos para não esconder o problema.
    console.error("[realtime] falha ao publicar evento", error);
  }
}
