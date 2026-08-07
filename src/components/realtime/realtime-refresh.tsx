"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REALTIME_EVENT } from "@/lib/realtime/channels";

// Assina os canais informados e força um refetch dos Server Components
// (router.refresh()) quando qualquer evento chega — nunca lê o payload do
// evento como dado (ver src/lib/realtime/publish.ts). Renderiza nada; é só
// um "gatilho" ligado à tela que o utiliza.
//
// Cobre reconexão sozinho: o cliente do Supabase reconecta o WebSocket
// automaticamente após queda de rede, e cada RE-conexão bem-sucedida
// dispara um refresh — assim nenhuma mudança que aconteceu durante a queda
// fica perdida na tela (CLAUDE.md: "suportar internet local instável").
//
// A PRIMEIRA vez que cada canal assina (logo após montar) NÃO dispara
// refresh: a tela acabou de ser buscada pela navegação normal que a
// montou, então atualizar de novo ali seria refazer a mesma consulta à
// toa — cada tela com tempo real estava buscando os próprios dados duas
// vezes seguidas em toda navegação (docs/performance/audit.md, achado
// #5). `subscribedOnce` rastreia por canal (não um booleano só) porque
// uma tela pode assinar mais de um canal ao mesmo tempo.
export function RealtimeRefresh({ channels }: { channels: string[] }) {
  const router = useRouter();

  useEffect(() => {
    if (channels.length === 0) return;

    const supabase = createClient();
    const subscribedOnce = new Set<string>();
    const subscriptions = channels.map((name) =>
      supabase
        .channel(name)
        .on("broadcast", { event: REALTIME_EVENT }, () => router.refresh())
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (subscribedOnce.has(name)) {
            router.refresh();
          } else {
            subscribedOnce.add(name);
          }
        }),
    );

    return () => {
      subscriptions.forEach((channel) => supabase.removeChannel(channel));
    };
    // channels muda de conteúdo, não de identidade de array, entre renders
    // — comparar pela chave textual evita reassinar em todo render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.join(",")]);

  return null;
}
