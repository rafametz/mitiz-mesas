"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { TOAST_COOKIE_NAME } from "@/lib/toast-cookie-name";

// Lê o cookie de vida curta que createOrderAction deixa antes de
// redirecionar (ver src/lib/toast-cookie.ts) e dispara o toast de
// confirmação — inteiramente client-side, de propósito: não muda a URL de
// destino (preserva os `toHaveURL(/\/pedidos$/)` do E2E) nem depende de
// estado de useActionState (que o redirect nunca deixa a página observar).
// Sempre montado nesta página; não faz nada quando o cookie não existe
// (visita normal, sem pedido recém-enviado).
export function OrderSentToast() {
  const { showToast } = useToast();

  useEffect(() => {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${TOAST_COOKIE_NAME}=`));
    if (!match) return;

    const message = decodeURIComponent(match.slice(TOAST_COOKIE_NAME.length + 1));
    document.cookie = `${TOAST_COOKIE_NAME}=; Max-Age=0; path=/`;
    if (message) showToast(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
