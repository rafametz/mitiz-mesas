import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { manageProductionDay, ManageProductionDayError } from "@/application/roast/manage-production-day";

describe("manageProductionDay (Administração — configurar produção por dia)", () => {
  let restaurantId: string;
  let roastProductId: string;
  const productionDayIds: string[] = [];
  const roastProductIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // `manageProductionDay` valida `date` como "AAAA-MM-DD" de verdade
  // (isValidDateKey) — diferente de outros testes deste módulo, que
  // escrevem direto no banco e podem usar um sufixo qualquer pra
  // garantir unicidade. Aqui o sufixo vira um deslocamento de dias a
  // partir de uma data-base bem no futuro, sempre um formato válido.
  const dayOffset = Date.now() % 3000;
  function uniqueDate(offset: number): string {
    const date = new Date(Date.UTC(2031, 0, 1));
    date.setUTCDate(date.getUTCDate() + dayOffset + offset);
    return date.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;

    const product = await prisma.roastProduct.create({
      data: { restaurantId, name: `Costela producao ${suffix}`, unit: "UN" },
    });
    roastProductId = product.id;
    roastProductIds.push(product.id);
  });

  afterAll(async () => {
    await prisma.roastProduction.deleteMany({
      where: { productionDayId: { in: productionDayIds } },
    });
    await prisma.roastProductionDay.deleteMany({ where: { id: { in: productionDayIds } } });
    await prisma.roastProduct.deleteMany({ where: { id: { in: roastProductIds } } });
    await prisma.$disconnect();
  });

  it("aceita quantidade planejada inteira", async () => {
    const day = await manageProductionDay({
      restaurantId,
      date: uniqueDate(0),
      quantities: [{ roastProductId, plannedQuantity: 8 }],
    });
    productionDayIds.push(day.id);

    const production = await prisma.roastProduction.findFirstOrThrow({
      where: { productionDayId: day.id, roastProductId },
    });
    expect(production.plannedQuantity.toString()).toBe("8");
  });

  it("rejeita quantidade planejada fracionada (pedido do usuário 2026-10-04)", async () => {
    await expect(
      manageProductionDay({
        restaurantId,
        date: uniqueDate(1),
        quantities: [{ roastProductId, plannedQuantity: 0.4 }],
      }),
    ).rejects.toThrow();
  });

  it("não deixa reduzir o planejado abaixo do que já está reservado", async () => {
    const day = await manageProductionDay({
      restaurantId,
      date: uniqueDate(2),
      quantities: [{ roastProductId, plannedQuantity: 10 }],
    });
    productionDayIds.push(day.id);

    await prisma.roastProduction.updateMany({
      where: { productionDayId: day.id, roastProductId },
      data: { reservedQuantity: 6 },
    });

    await expect(
      manageProductionDay({
        restaurantId,
        date: uniqueDate(2),
        quantities: [{ roastProductId, plannedQuantity: 3 }],
      }),
    ).rejects.toThrow(ManageProductionDayError);
  });
});
