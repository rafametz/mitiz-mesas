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
// automaticamente após queda de rede, e cada (re)conexão bem-sucedida
// dispara um refresh — assim nenhuma mudança que aconteceu durante a queda
// fica perdida na tela (CLAUDE.md: "suportar internet local instável").
export function RealtimeRefresh({ channels }: { channels: string[] }) {
  const router = useRouter();

  useEffect(() => {
    if (channels.length === 0) return;

    const supabase = createClient();
    const subscriptions = channels.map((name) =>
      supabase
        .channel(name)
        .on("broadcast", { event: REALTIME_EVENT }, () => router.refresh())
        .subscribe((status) => {
          if (status === "SUBSCRIBED") router.refresh();
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
