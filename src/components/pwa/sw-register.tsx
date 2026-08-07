"use client";

import { useEffect } from "react";

// Registra public/sw.js — sozinho isso não faz o app funcionar offline
// (de propósito, ver comentário no próprio sw.js), só habilita o
// navegador a oferecer "Instalar app" no celular. Falha em registrar não
// pode quebrar nada: instalar como PWA é um extra, o app continua
// funcionando normalmente pelo navegador sem isso.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
