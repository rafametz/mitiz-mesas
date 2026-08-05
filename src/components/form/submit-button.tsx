"use client";

import { useFormStatus } from "react-dom";

const VARIANTS = {
  primary: "bg-wine text-bg hover:bg-wine-dark",
  outline: "border border-ink/20 text-ink hover:bg-ink/5",
  danger: "border border-wine/40 text-wine hover:bg-wine/5",
} as const;

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
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {pending ? (pendingLabel ?? "Salvando...") : children}
    </button>
  );
}
