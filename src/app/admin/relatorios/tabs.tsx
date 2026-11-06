import Link from "next/link";

const TABS = [
  { key: "periodo", href: "/admin/relatorios", label: "Vendas por período" },
  { key: "produtos", href: "/admin/relatorios/produtos", label: "Vendas por produto" },
  { key: "mesas", href: "/admin/relatorios/mesas", label: "Tempo de mesas abertas" },
  { key: "horarios", href: "/admin/relatorios/horarios-pico", label: "Horários de pico" },
] as const;

// 4 relatórios (Módulo 11, pedido do usuário) em abas — mesmo padrão de
// HistoricoTabs (src/app/(staff)/historico/tabs.tsx), incluindo o visual
// em pílula de 2026-11-06.
export function RelatoriosTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-wine text-bg shadow-card"
                : "border border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
