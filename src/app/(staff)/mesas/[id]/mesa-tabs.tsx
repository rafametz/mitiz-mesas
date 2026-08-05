"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, History, ReceiptText, Users, Wallet } from "lucide-react";

const TABS = [
  { href: "", label: "Comanda", icon: ClipboardList },
  { href: "/pessoas", label: "Pessoas", icon: Users },
  { href: "/pedidos", label: "Pedidos", icon: ReceiptText },
  { href: "/pagamentos", label: "Pagamentos", icon: Wallet },
  { href: "/historico", label: "Histórico", icon: History },
];

export function MesaTabs({ tableId }: { tableId: string }) {
  const pathname = usePathname();
  const base = `/mesas/${tableId}`;

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const isActive = tab.href === "" ? pathname === base : pathname === href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors ${
              isActive ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-4 w-4" strokeWidth={isActive ? 2.25 : 1.75} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
