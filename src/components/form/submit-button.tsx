"use client";

import { useFormStatus } from "react-dom";
import { buttonClassName, type ButtonVariant } from "@/components/ui/button";

// Estilo compartilhado com Button (src/components/ui/button.tsx) via
// buttonClassName — só acrescenta o estado `pending` do useFormStatus e
// força type="submit". Antes da Fase 1 do plano de modernização, o mapa de
// variantes vivia duplicado aqui.
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={buttonClassName({ variant, className })}
    >
      {pending ? (pendingLabel ?? "Salvando...") : children}
    </button>
  );
}
