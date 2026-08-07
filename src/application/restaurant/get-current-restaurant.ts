import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

// MVP é single-tenant: sempre existe exatamente um Restaurant ativo (ADR
// 0001 item 6). Isto é o único lugar do código que assume isso — quando
// multi-unidade virar realidade, é aqui que a resolução por usuário/sessão
// entra, sem precisar mudar quem chama.
//
// cache() do React deduplica dentro da mesma requisição — chamado em
// ~29 arquivos; sem isso, uma única navegação podia repetir esta consulta
// várias vezes (docs/performance/audit.md, achado #1).
export const getCurrentRestaurant = cache(async () => {
  const restaurant = await prisma.restaurant.findFirst({ where: { active: true } });
  if (!restaurant) {
    throw new Error(
      "Nenhum Restaurant encontrado. Rode `npm run prisma:seed` antes de usar a administração.",
    );
  }
  return restaurant;
});
