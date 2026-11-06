import Link from "next/link";
import { ShoppingBag, ShoppingCart, UtensilsCrossed } from "lucide-react";

const TABS = [
  { key: "mesas", href: "/mesas", label: "Mesas", icon: UtensilsCrossed },
  { key: "retiradas", href: "/retiradas", label: "Retiradas", icon: ShoppingBag },
  { key: "pdv", href: "/pdv", label: "PDV", icon: ShoppingCart },
] as const;

// Telas irmãs do mesmo público — abas em vez de mais um ícone na barra
// inferior, mesmo padrão já usado em historico/tabs.tsx (CLAUDE.md seção
// 11: não virar sistema desktop com barra lotada). Mesas/Retiradas:
// módulo Retiradas, 2026-08-14. PDV: Módulo 17 (venda de balcão,
// 2026-10-20) — só visível com `pdv.sell` (ADMIN/CASHIER), por isso a
// única aba condicional das três; Garçom nunca vê a aba.
//
// Visual em pílula (relato do usuário, 2026-11-06: o sublinhado ficava
// "só escrito", pouco destacado como botão) — mesmo padrão já usado no
// seletor de setor de produção (producao/[sectorId]/page.tsx): ativa
// preenchida em wine, inativa com borda fina, ambas com ícone. Ícones
// reaproveitados de onde cada conceito já aparece no resto do app
// (Mesas/Atendimento: bottom-nav.tsx; Retiradas: já usada em
// retiradas/page.tsx e admin/mesas/page.tsx; PDV: já usada dentro do
// próprio carrinho em pdv-sale-screen.tsx).
export function AtendimentoTabs({
  active,
  canSellPdv = false,
}: {
  active: (typeof TABS)[number]["key"];
  canSellPdv?: boolean;
}) {
  const tabs = TABS.filter((tab) => tab.key !== "pdv" || canSellPdv);
  return (
    <div className="flex gap-2" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-wine text-bg shadow-card"
                : "border border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
