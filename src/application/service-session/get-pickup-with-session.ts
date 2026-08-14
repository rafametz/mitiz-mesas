import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Equivalente de get-table-with-session.ts para retirada (módulo
// Retiradas, 2026-08-14) — mais simples porque não existe um "Table"
// separado da sessão: o id da rota já é o id da própria ServiceSession, e
// ela permanece acessível na mesma URL depois de fechada (não existe o
// conceito de "mesa livre para reabrir" aqui). cache() do React deduplica
// dentro da mesma requisição, mesmo racional de getTableWithActiveSession.
export const getPickupSession = cache(async (sessionId: string) => {
  const session = await prisma.serviceSession.findUnique({
    where: { id: sessionId },
    include: { waiter: true },
  });

  if (!session || session.type !== "PICKUP") notFound();

  return session;
});
