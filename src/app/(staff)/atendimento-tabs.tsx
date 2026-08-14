import Link from "next/link";

const TABS = [
  { key: "mesas", href: "/mesas", label: "Mesas" },
  { key: "retiradas", href: "/retiradas", label: "Retiradas" },
] as const;

// Duas telas irmãs do mesmo público (Garçom/Caixa/Admin) — abas em vez de
// um sétimo ícone na barra inferior, mesmo padrão já usado em
// historico/tabs.tsx (CLAUDE.md seção 11: não virar sistema desktop com
// barra lotada). Módulo Retiradas, 2026-08-14 — decisão confirmada com o
// usuário.
export function AtendimentoTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          role="tab"
          aria-selected={active === tab.key}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === tab.key
              ? "border-wine text-wine"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
