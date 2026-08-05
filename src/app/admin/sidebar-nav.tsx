"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beef, ChefHat, Tags, Table2 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin/mesas", label: "Mesas", icon: Table2 },
  { href: "/admin/setores", label: "Setores", icon: ChefHat },
  { href: "/admin/categorias", label: "Categorias", icon: Tags },
  { href: "/admin/produtos", label: "Produtos", icon: Beef },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 md:flex-col">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-gold/15 text-gold" : "text-bg/70 hover:bg-bg/5 hover:text-bg"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
