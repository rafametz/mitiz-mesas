import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { MitizMark } from "@/components/brand/mitiz-mark";
import { SidebarNav } from "./sidebar-nav";

// Toda a área /admin exige a permissão admin.manage (CLAUDE.md seção 5 —
// cadastros são exclusivos do Administrador). Checagem no backend, aqui no
// layout — não é decoração de UI escondendo link, é o guard de verdade.
//
// Sidebar fixa (desktop-first — CLAUDE.md: "Administrador: Desktop"), na
// linha de Linear/Notion/Stripe. Em telas estreitas vira barra horizontal
// no topo em vez de gaveta — a área de admin não precisa da mesma economia
// de espaço do app do garçom.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col gap-6 border-b border-shell-line bg-shell p-4 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MitizMark className="h-7 w-7 text-gold" />
            <span className="font-display text-base font-semibold text-bg">Administração</span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1 text-xs font-medium text-bg/60 hover:text-bg md:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>

        <div className="overflow-x-auto md:overflow-visible">
          <SidebarNav />
        </div>

        <Link
          href="/"
          className="mt-auto hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-bg/60 hover:bg-bg/5 hover:text-bg md:flex"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao app
        </Link>
      </aside>

      <main className="mx-auto w-full max-w-4xl p-4 md:p-8">{children}</main>
    </div>
  );
}
