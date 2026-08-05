"use client";

import { useEffect, useState } from "react";

// Cronômetro que atualiza a cada segundo no navegador de quem está vendo a
// tela — não é tempo real multiusuário (isso é Módulo 5, via WebSocket/
// realtime), só evita a leitura "congelada" no momento do último carregamento
// da página, como no painel de referência do administrador.
export function ElapsedClock({ since }: { since: string }) {
  const [label, setLabel] = useState(() => formatHms(since));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatHms(since)), 1000);
    return () => clearInterval(id);
  }, [since]);

  return <span className="tabular">{label}</span>;
}

function formatHms(since: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}
