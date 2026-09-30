"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  CircleUserRound,
  Drumstick,
  History,
  Printer,
  Settings2,
  UtensilsCrossed,
} from "lucide-react";

const ITEMS = [
  { href: "/mesas", label: "Mesas", icon: UtensilsCrossed, show: "always" as const },
  { href: "/reservas-assados", label: "Reservas", icon: Drumstick, show: "roasts" as const },
  { href: "/producao", label: "Produção", icon: ChefHat, show: "production" as const },
  { href: "/impressao", label: "Impressão", icon: Printer, show: "print" as const },
  { href: "/historico", label: "Histórico", icon: History, show: "history" as const },
  { href: "/admin", label: "Admin", icon: Settings2, show: "admin" as const },
  { href: "/", label: "Conta", icon: CircleUserRound, show: "always" as const },
];

// Barra de navegação fixa, ícone + rótulo — CLAUDE.md seção 11: área de
// toque adequada, uma mão, sem depender de hover.
//
// Rolagem horizontal (pedido do usuário 2026-09-30): com mais itens
// entrando com o tempo (Reservas, mais os condicionais por permissão),
// dividir a barra em partes iguais (`flex-1`) ia espremendo cada ícone
// e cortando o rótulo em telas de celular estreitas. Cada item agora tem
// uma largura mínima confortável (`shrink-0`); quando os itens visíveis
// não cabem na largura da tela, a barra rola de lado (arrastar/gesto) em
// vez de comprimir. Sempre começa no início ao abrir o app — não há
// nenhum scroll automático pro item ativo, é só o comportamento nativo
// do navegador (o elemento nasce com scrollLeft = 0).
export function BottomNav({
  isAdmin,
  canProduction,
  canPrintJobs,
  canViewHistory,
  canViewRoasts,
}: {
  isAdmin: boolean;
  canProduction: boolean;
  canPrintJobs: boolean;
  canViewHistory: boolean;
  canViewRoasts: boolean;
}) {
  const pathname = usePathname();
  const items = ITEMS.filter((item) => {
    if (item.show === "admin") return isAdmin;
    if (item.show === "production") return canProduction;
    if (item.show === "print") return canPrintJobs;
    if (item.show === "history") return canViewHistory;
    if (item.show === "roasts") return canViewRoasts;
    return true;
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-shell"
      aria-label="Navegação principal"
    >
      <div className="no-scrollbar mx-auto max-w-3xl overflow-x-auto">
        <div className="flex min-w-full justify-center">
          {items.map((item) => {
            // "Mesas" também fica ativo em /retiradas — são abas irmãs da
            // mesma seção (AtendimentoTabs), módulo Retiradas 2026-08-14.
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href) ||
                  (item.href === "/mesas" && pathname.startsWith("/retiradas"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-[76px] shrink-0 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
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
      </div>
    </nav>
  );
}
