"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, CircleUserRound, History, Printer, Settings2, UtensilsCrossed } from "lucide-react";

const ITEMS = [
  { href: "/mesas", label: "Mesas", icon: UtensilsCrossed, show: "always" as const },
  { href: "/producao", label: "Produção", icon: ChefHat, show: "production" as const },
  { href: "/impressao", label: "Impressão", icon: Printer, show: "print" as const },
  { href: "/historico", label: "Histórico", icon: History, show: "history" as const },
  { href: "/admin", label: "Admin", icon: Settings2, show: "admin" as const },
  { href: "/", label: "Conta", icon: CircleUserRound, show: "always" as const },
];

// Barra de navegação fixa, ícone + rótulo — CLAUDE.md seção 11: área de
// toque adequada, uma mão, sem depender de hover.
export function BottomNav({
  isAdmin,
  canProduction,
  canPrintJobs,
  canViewHistory,
}: {
  isAdmin: boolean;
  canProduction: boolean;
  canPrintJobs: boolean;
  canViewHistory: boolean;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => {
    if (item.show === "admin") return isAdmin;
    if (item.show === "production") return canProduction;
    if (item.show === "print") return canPrintJobs;
    if (item.show === "history") return canViewHistory;
    return true;
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-shell"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex max-w-3xl">
        {items.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                isActive ? "text-gold" : "text-bg/60 hover:text-bg"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-6 w-6" strokeWidth={isActive ? 2.25 : 1.75} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
