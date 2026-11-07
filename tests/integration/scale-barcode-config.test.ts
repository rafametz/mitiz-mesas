import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getScaleBarcodeConfig,
  saveScaleBarcodeConfig,
} from "@/application/pdv/scale-barcode-config";
import { ScaleBarcodeConfigValidationError } from "@/domain/pdv/scale-barcode-config";

// Teste de integração — configuração da balança do PDV (tela
// /admin/configuracoes, pedido do usuário 2026-11-07). Singleton por
// restaurante: cobre o upsert (cria na primeira vez, atualiza depois) e a
// auditoria gravada junto.
describe("saveScaleBarcodeConfig", () => {
  let restaurantId: string;
  let userId: string;

  beforeAll(async () => {
    const restaurant = await prisma.restaurant.findFirstOrThrow();
    restaurantId = restaurant.id;
    userId = (await prisma.user.findFirstOrThrow({ where: { restaurantId } })).id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { restaurantId, entityType: "ScaleBarcodeConfig" },
    });
    await prisma.scaleBarcodeConfig.deleteMany({ where: { restaurantId } });
    await prisma.$disconnect();
  });

  it("cria a configuração na primeira vez e atualiza nas seguintes (upsert) com auditoria", async () => {
    expect(await getScaleBarcodeConfig(restaurantId)).toBeNull();

    const created = await saveScaleBarcodeConfig(restaurantId, userId, {
      enabled: true,
      prefixDigit: 2,
      totalLength: 13,
      productCodeStart: 2,
      productCodeEnd: 5,
      valueStart: 9,
      valueEnd: 12,
      valueType: "WEIGHT",
      decimalPlaces: 3,
    });
    expect(created.enabled).toBe(true);
    expect(created.prefixDigit).toBe(2);

    const afterCreate = await getScaleBarcodeConfig(restaurantId);
    expect(afterCreate?.id).toBe(created.id);

    const updated = await saveScaleBarcodeConfig(restaurantId, userId, {
      enabled: false,
      prefixDigit: 3,
      totalLength: 14,
      productCodeStart: 2,
      productCodeEnd: 6,
      valueStart: 8,
      valueEnd: 13,
      valueType: "PRICE",
      decimalPlaces: 2,
    });
    // Mesma linha (upsert), não cria uma segunda configuração.
    expect(updated.id).toBe(created.id);
    expect(updated.enabled).toBe(false);
    expect(updated.valueType).toBe("PRICE");

    const rowCount = await prisma.scaleBarcodeConfig.count({ where: { restaurantId } });
    expect(rowCount).toBe(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: { restaurantId, entityType: "ScaleBarcodeConfig", entityId: created.id },
    });
    expect(auditLogs).toHaveLength(2);
    expect(auditLogs.every((log) => log.action === "scale_barcode_config.saved")).toBe(true);
  });

  it("rejeita configuração inválida antes de gravar (faixa de dígitos fora do tamanho total)", async () => {
    await expect(
      saveScaleBarcodeConfig(restaurantId, userId, {
        enabled: true,
        prefixDigit: 2,
        totalLength: 13,
        productCodeStart: 2,
        productCodeEnd: 5,
        valueStart: 9,
        valueEnd: 20,
        valueType: "WEIGHT",
        decimalPlaces: 3,
      }),
    ).rejects.toThrow(ScaleBarcodeConfigValidationError);
  });
});
