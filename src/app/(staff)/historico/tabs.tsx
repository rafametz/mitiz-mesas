import Link from "next/link";

const TABS = [
  { key: "atendimentos", href: "/historico", label: "Atendimentos" },
  { key: "auditoria", href: "/historico/auditoria", label: "Auditoria" },
] as const;

// Duas telas irmãs (Módulo 9 e 10) do mesmo público (Admin/Caixa,
// AUDIT_VIEW) — abas em vez de um sétimo ícone na barra inferior (já tem
// Mesas/Produção/Impressão/Histórico/Admin/Conta; CLAUDE.md seção 11: não
// virar sistema desktop com barra lotada).
export function HistoricoTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
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
