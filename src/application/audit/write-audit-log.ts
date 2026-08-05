import "server-only";
import type { Prisma } from "@prisma/client";

// Auditoria genérica (CLAUDE.md regra 22) — usada por qualquer ação
// crítica (cancelamento, desconto, reabertura, etc.). Recebe o client de
// transação (`tx`) para o registro entrar na mesma transação da operação
// que está sendo auditada — auditoria não pode "sumir" se algo depois
// falhar e a transação for revertida, nem "sobrar" se a operação falhar.
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  params: {
    restaurantId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      restaurantId: params.restaurantId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      // Prisma exige o tipo específico dele para JSON; um Record simples é
      // estruturalmente compatível em runtime, só não bate no tipo exato.
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
