import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "./recalculate-totals";
import { canModifyClosingCharges } from "@/domain/service-session/closing";
import { toDecimal, ZERO } from "@/lib/money";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";

export class ApplyServiceChargeError extends Error {}

const applySchema = z.object({
  percent: z.coerce
    .number()
    .min(0, "Percentual não pode ser negativo.")
    .max(100, "Percentual acima de 100%."),
  // Retirada da taxa pelo cliente (CLAUDE.md regra 16) — fica registrada,
  // não é só um percent = 0 silencioso.
  waived: z.boolean().default(false),
  waivedReason: z.string().trim().max(300).optional(),
});

// Taxa de serviço é opcional no fechamento (regra 15). Diferente do
// desconto (que exige anulação explícita e auditada por ser uma
// concessão), aqui cada chamada só grava um registro novo — nunca apaga
// o anterior (regra 8/17, mesmo princípio geral de não apagar registro
// financeiro), e o mais recente (`createdAt` desc) é sempre o vigente.
export async function applyServiceCharge(
  serviceSessionId: string,
  actorUserId: string,
  input: { percent: string | number; waived?: boolean; waivedReason?: string },
) {
  const data = applySchema.parse(input);
  if (data.waived && !data.waivedReason) {
    throw new ApplyServiceChargeError("Informe o motivo da retirada da taxa de serviço.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.serviceSession.findUniqueOrThrow({
      where: { id: serviceSessionId },
    });

    if (!canModifyClosingCharges(session.status)) {
      throw new ApplyServiceChargeError(
        "Solicite o fechamento antes de aplicar a taxa de serviço.",
      );
    }

    const percent = toDecimal(data.percent);
    const amountApplied = data.waived
      ? ZERO
      : toDecimal(session.subtotalAmount).mul(percent).div(100);

    const serviceCharge = await tx.serviceCharge.create({
      data: {
        serviceSessionId,
        percent,
        amountApplied,
        waived: data.waived,
        waivedReason: data.waived ? data.waivedReason : null,
        appliedById: actorUserId,
      },
    });

    await writeAuditLog(tx, {
      restaurantId: session.restaurantId,
      userId: actorUserId,
      tableId: session.tableId,
      action: data.waived ? "service_charge.waived" : "service_charge.applied",
      entityType: "ServiceCharge",
      entityId: serviceCharge.id,
      metadata: {
        percent: percent.toString(),
        amountApplied: amountApplied.toString(),
        waived: data.waived,
        waivedReason: data.waivedReason ?? null,
      },
    });

    await recalculateSessionTotals(tx, serviceSessionId, {
      discountAmount: session.discountAmount,
      serviceChargeAmount: amountApplied,
      paidAmount: session.paidAmount,
    });

    return session;
  });

  await runAfterResponse(() =>
    publishChange(sessionRealtimeChannels(result), "service_session.service_charge_applied"),
  );

  return { tableId: result.tableId, restaurantId: result.restaurantId };
}
