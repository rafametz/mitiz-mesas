"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

type ToastTone = "success" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON_CLASS: Record<ToastTone, string> = {
  success: "text-free-dark",
  info: "text-gold-dark",
};

// Some sozinho depois desse tempo — "toast somente para confirmações
// breves" (CLAUDE.md §11 / docs/design/design-system.md "Feedback").
const DURATION_MS = 3000;

// Confirmação textual explícita depois de uma ação bem-sucedida — endereça
// o achado "feedback de sucesso é sempre implícito (redirecionamento ou
// atualização de lista), nunca uma confirmação textual"
// (docs/design/frontend-audit.md, item "Estados de loading, vazio e
// erro"). Escopo deliberadamente pequeno: só sucesso. Erro nunca passa por
// aqui — continua sempre inline, no contexto (`role="alert"` já usado em
// todo formulário), porque erro importante não pode desaparecer sozinho.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center gap-2 rounded-control-sm border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink shadow-panel"
          >
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${TONE_ICON_CLASS[toast.tone]}`} />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de um ToastProvider.");
  return ctx;
}
