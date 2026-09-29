import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PageHeader } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { todaySaoPaulo } from "@/lib/datetime";
import { openProductionDay } from "./actions";

export default async function ProducaoAssadosPage() {
  const restaurant = await getCurrentRestaurant();
  const days = await prisma.roastProductionDay.findMany({
    where: { restaurantId: restaurant.id },
    include: { _count: { select: { reservations: { where: { status: { not: "CANCELLED" } } } } } },
    orderBy: { date: "desc" },
    take: 30,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Produção por dia"
        subtitle="Quantidade planejada de cada produto assado, por dia."
      />
      <Link
        href="/admin/reservas-assados"
        className="text-sm font-medium text-wine underline underline-offset-2"
      >
        ← Catálogo de produtos
      </Link>

      <div className="border-b border-line pb-6">
        <h2 className="mb-3 font-display text-base font-semibold text-ink">Abrir dia</h2>
        <form action={openProductionDay} className="flex max-w-xs items-end gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm">
            <span className="font-medium text-ink">Data</span>
            <input
              type="date"
              name="date"
              defaultValue={todaySaoPaulo()}
              required
              className="h-11 rounded-control-sm border border-line bg-surface px-3 text-base text-ink focus:border-wine focus:outline-none focus:ring-2 focus:ring-gold"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-control-sm border border-wine bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
          >
            Abrir
          </button>
        </form>
      </div>

      <Table>
        <thead>
          <Tr>
            <Th>Data</Th>
            <Th>Observação</Th>
            <Th>Reservas</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Tr key={day.id}>
              <Td>{day.date.split("-").reverse().join("/")}</Td>
              <Td>{day.notes || "-"}</Td>
              <Td>{day._count.reservations}</Td>
              <Td>
                <Link
                  href={`/admin/reservas-assados/producao/${day.id}`}
                  className="font-medium text-wine underline"
                >
                  Configurar
                </Link>
              </Td>
            </Tr>
          ))}
          {days.length === 0 && (
            <Tr>
              <Td colSpan={4} className="text-muted">
                Nenhum dia de produção configurado ainda.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
