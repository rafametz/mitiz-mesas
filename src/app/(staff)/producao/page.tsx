import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PageHeader } from "@/components/ui/card";

// Entrada de /producao: manda direto para o primeiro setor ativo (a tela
// real é por setor — CLAUDE.md seção 6, cada estação física acompanha só o
// seu setor). Só mostra a lista quando não há para onde mandar sozinho.
export default async function ProducaoIndexPage() {
  await requirePermission(PERMISSIONS.PRODUCTION_STATUS_UPDATE);
  const restaurant = await getCurrentRestaurant();

  const sectors = await prisma.productionSector.findMany({
    where: { restaurantId: restaurant.id, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const firstSector = sectors[0];
  if (firstSector) {
    redirect(`/producao/${firstSector.id}`);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4 pt-6">
      <PageHeader title="Produção" subtitle="Nenhum setor de produção cadastrado ainda." />
      <p className="text-sm text-muted">
        Cadastre um setor (Cozinha, Parrilla, Bar...) em{" "}
        <Link href="/admin/setores" className="font-medium text-wine underline">
          Administração → Setores
        </Link>
        .
      </p>
    </main>
  );
}
