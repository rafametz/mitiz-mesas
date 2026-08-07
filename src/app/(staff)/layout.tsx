import { requireUser } from "@/application/auth/get-current-user";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { MitizMark } from "@/components/brand/mitiz-mark";
import { BottomNav } from "./bottom-nav";

// Shell do "app do salão" — garçom/caixa, mobile-first (CLAUDE.md seção 11).
// Barra de marca fina no topo + navegação fixa embaixo, ao gosto dos
// grandes apps de operação (Toast, Square for Restaurants, iFood Gestor).
// /admin tem shell própria (sidebar) e não passa por aqui.
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = hasPermission(user.permissions, PERMISSIONS.ADMIN_MANAGE);
  const canProduction = hasPermission(user.permissions, PERMISSIONS.PRODUCTION_STATUS_UPDATE);
  const canPrintJobs = hasPermission(user.permissions, PERMISSIONS.PRINT_JOBS_MANAGE);

  return (
    <div className="flex min-h-screen flex-col pb-20">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control-sm focus:bg-wine focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-bg"
      >
        Pular para o conteúdo
      </a>
      <header className="flex items-center gap-2 bg-shell px-4 py-2.5">
        <MitizMark className="h-5 w-5 text-gold" />
        <span className="font-display text-sm font-semibold italic text-bg">MITIZ Mesas</span>
      </header>
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <BottomNav isAdmin={isAdmin} canProduction={canProduction} canPrintJobs={canPrintJobs} />
    </div>
  );
}
