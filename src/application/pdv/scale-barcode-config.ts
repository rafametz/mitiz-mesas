import "server-only";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import {
  validateScaleBarcodeConfig,
  ScaleBarcodeConfigValidationError,
  type ScaleBarcodeConfigInput,
} from "@/domain/pdv/scale-barcode-config";

export { ScaleBarcodeConfigValidationError };
export type { ScaleBarcodeConfigInput };

// Singleton por restaurante (MVP é single-tenant) — não existe até o admin
// salvar pela primeira vez; a tela usa valores padrão nesse caso (ver
// page.tsx).
export async function getScaleBarcodeConfig(restaurantId: string) {
  return prisma.scaleBarcodeConfig.findUnique({ where: { restaurantId } });
}

// Upsert + auditoria na mesma transação (mesmo racional de
// src/app/admin/usuarios/actions.ts) — muda como o PDV vai interpretar
// peso/valor lido da balança, por isso fica registrado quem mudou o quê.
export async function saveScaleBarcodeConfig(
  restaurantId: string,
  actorUserId: string,
  data: ScaleBarcodeConfigInput,
) {
  validateScaleBarcodeConfig(data);

  return prisma.$transaction(async (tx) => {
    const config = await tx.scaleBarcodeConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...data },
      update: { ...data },
    });

    await writeAuditLog(tx, {
      restaurantId,
      userId: actorUserId,
      tableId: null,
      action: "scale_barcode_config.saved",
      entityType: "ScaleBarcodeConfig",
      entityId: config.id,
      metadata: { ...data },
    });

    return config;
  });
}
