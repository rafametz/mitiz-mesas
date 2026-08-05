import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { openTable, OpenTableError } from "@/application/service-session/open-table";

// Teste de integração — precisa de DATABASE_URL/DIRECT_URL apontando para
// um Postgres real (o Supabase do projeto). Roda com `npm run
// test:integration`, separado de `npm test` (só unitários, sem I/O).
describe("openTable", () => {
  let restaurantId: string;
  let waiterId: string;
  const createdTableIds: string[] = [];

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    const user = await prisma.user.findFirstOrThrow({ where: { restaurantId } });
    waiterId = user.id;
  });

  afterAll(async () => {
    // Limpa o que este arquivo criou — sessões antes de mesas (FK Restrict
    // de ServiceSession -> Table).
    await prisma.serviceSession.deleteMany({ where: { tableId: { in: createdTableIds } } });
    await prisma.table.deleteMany({ where: { id: { in: createdTableIds } } });
    await prisma.$disconnect();
  });

  async function createFreeTable() {
    const table = await prisma.table.create({
      data: { restaurantId, number: `TESTE-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    createdTableIds.push(table.id);
    return table;
  }

  it("abre a mesa: cria ServiceSession OPEN, Guests e marca a mesa OCCUPIED", async () => {
    const table = await createFreeTable();

    const session = await openTable({
      tableId: table.id,
      waiterId,
      guestCount: 3,
      responsibleName: "Fulano",
      guestNames: ["Fulano", "Ciclana"],
    });

    expect(session.status).toBe("OPEN");
    expect(session.guestCount).toBe(3);

    const updatedTable = await prisma.table.findUniqueOrThrow({ where: { id: table.id } });
    expect(updatedTable.status).toBe("OCCUPIED");

    const guests = await prisma.guest.findMany({ where: { serviceSessionId: session.id } });
    expect(guests.map((g) => g.name).sort()).toEqual(["Ciclana", "Fulano"]);
  });

  it("regra 1 (aplicação): rejeita abrir uma mesa que já não está livre", async () => {
    const table = await createFreeTable();
    await openTable({ tableId: table.id, waiterId, guestCount: 2 });

    await expect(openTable({ tableId: table.id, waiterId, guestCount: 2 })).rejects.toThrow(
      OpenTableError,
    );
  });

  it("regra 1 (banco): índice único parcial rejeita duas sessões ativas na mesma mesa mesmo pulando a checagem da aplicação", async () => {
    const table = await createFreeTable();

    await prisma.serviceSession.create({
      data: { tableId: table.id, waiterId, guestCount: 1, status: "OPEN" },
    });

    // Insert direto via Prisma, sem passar pelo canOpenTable() da
    // aplicação — testa a rede de segurança do banco isoladamente
    // (docs/database/schema.md §4).
    await expect(
      prisma.serviceSession.create({
        data: { tableId: table.id, waiterId, guestCount: 1, status: "WAITING_CLOSING" },
      }),
    ).rejects.toThrow();
  });
});
