import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ACTIVE_SERVICE_SESSION_STATUSES } from "@/domain/service-session/states";

// cache() do React deduplica chamadas idênticas dentro da mesma requisição
// — o layout da mesa e a página da aba ativa pedem os mesmos dados sem
// duplicar round-trip ao banco.
export const getTableWithActiveSession = cache(async (tableId: string) => {
  const table = await prisma.table.findUnique({
    where: { id: tableId },
    include: {
      serviceSessions: {
        where: { status: { in: [...ACTIVE_SERVICE_SESSION_STATUSES] } },
        include: { waiter: true, guests: { orderBy: { sortOrder: "asc" } } },
        take: 1,
      },
    },
  });

  if (!table) notFound();

  return { table, session: table.serviceSessions[0] ?? null };
});
