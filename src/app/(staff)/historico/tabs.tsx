import Link from "next/link";

const TABS = [
  { key: "atendimentos", href: "/historico", label: "Atendimentos" },
  { key: "vendas-pdv", href: "/historico/vendas-pdv", label: "Vendas PDV" },
  { key: "auditoria", href: "/historico/auditoria", label: "Auditoria" },
] as const;

// Duas telas irmãs (Módulo 9 e 10) do mesmo público (Admin/Caixa,
// AUDIT_VIEW) — abas em vez de um sétimo ícone na barra inferior (já tem
// Mesas/Produção/Impressão/Histórico/Admin/Conta; CLAUDE.md seção 11: não
// virar sistema desktop com barra lotada).
//
// Visual em pílula (2026-11-06, mesmo ajuste pedido para
// AtendimentoTabs — ver src/app/(staff)/atendimento-tabs.tsx): sem ícone
// aqui, diferente de lá — não há um ícone já estabelecido em outro lugar
// do app pra "Atendimentos"/"Auditoria", e inventar um novo só pra esta
// troca seria decisão estética sem base, não reaproveito de padrão.
export function HistoricoTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
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
