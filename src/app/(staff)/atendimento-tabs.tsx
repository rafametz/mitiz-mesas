import Link from "next/link";

const TABS = [
  { key: "mesas", href: "/mesas", label: "Mesas" },
  { key: "retiradas", href: "/retiradas", label: "Retiradas" },
  { key: "pdv", href: "/pdv", label: "PDV" },
] as const;

// Telas irmãs do mesmo público — abas em vez de mais um ícone na barra
// inferior, mesmo padrão já usado em historico/tabs.tsx (CLAUDE.md seção
// 11: não virar sistema desktop com barra lotada). Mesas/Retiradas:
// módulo Retiradas, 2026-08-14. PDV: Módulo 17 (venda de balcão,
// 2026-10-20) — só visível com `pdv.sell` (ADMIN/CASHIER), por isso a
// única aba condicional das três; Garçom nunca vê a aba.
export function AtendimentoTabs({
  active,
  canSellPdv = false,
}: {
  active: (typeof TABS)[number]["key"];
  canSellPdv?: boolean;
}) {
  const tabs = TABS.filter((tab) => tab.key !== "pdv" || canSellPdv);
  return (
    <div className="flex gap-1 border-b border-line" role="tablist">
      {tabs.map((tab) => (
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
