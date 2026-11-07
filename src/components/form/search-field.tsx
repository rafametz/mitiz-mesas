"use client";

import { Search, X } from "lucide-react";
import type { KeyboardEvent } from "react";
import { inputBaseClass } from "@/components/ui/input";

// Primeiro uso real de busca no projeto (PDV, Módulo 17, 2026-10-20) —
// estava listado como "ainda não implementado" em docs/design/design-
// system.md por falta de necessidade até agora. Ícone + botão de limpar
// seguem o mesmo padrão visual do prefixo "R$" de MoneyField. `onKeyDown`
// é exposto porque um leitor de código de barras USB/Bluetooth funciona
// como teclado — digita rápido e manda Enter; quem usa este campo decide
// o que fazer com esse Enter (ex.: casar código de barras exato).
export function SearchField({
  id,
  value,
  onChange,
  onKeyDown,
  placeholder,
  ariaLabel,
  autoFocus,
  className = "",
}: {
  // Opcional — só quando quem chama também renderiza um <label htmlFor>
  // visível por fora (ex.: admin/produtos), associando os dois. Sem isto,
  // `ariaLabel` sozinho já nomeia o campo pra leitor de tela (uso original,
  // PDV).
  id?: string;
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-muted"
        aria-hidden
      />
      <input
        id={id}
        type="text"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={`${inputBaseClass} w-full pl-10 ${value ? "pr-10" : "pr-3"}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-control-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
