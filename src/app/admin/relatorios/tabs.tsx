import Link from "next/link";

const TABS = [
  { key: "periodo", href: "/admin/relatorios", label: "Vendas por período" },
  { key: "produtos", href: "/admin/relatorios/produtos", label: "Vendas por produto" },
  { key: "mesas", href: "/admin/relatorios/mesas", label: "Tempo de mesas abertas" },
  { key: "horarios", href: "/admin/relatorios/horarios-pico", label: "Horários de pico" },
] as const;

// 4 relatórios (Módulo 11, pedido do usuário) em abas — mesmo padrão de
// HistoricoTabs (src/app/(staff)/historico/tabs.tsx).
export function RelatoriosTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
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
