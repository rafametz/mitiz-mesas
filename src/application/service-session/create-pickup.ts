import "server-only";
import { z } from "zod";
import { Prisma, PickupOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishChange } from "@/lib/realtime/publish";
import { sessionRealtimeChannels } from "./session-realtime";
import { runAfterResponse } from "@/lib/run-after-response";
import { combineTodayTimeSaoPaulo } from "@/lib/datetime";

const createPickupSchema = z.object({
  restaurantId: z.string().min(1),
  waiterId: z.string().min(1, "Selecione o garçom responsável"),
  customerName: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  customerPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  pickupOrigin: z.nativeEnum(PickupOrigin).optional(),
  // "HH:mm" — combinado com o dia de hoje em America/Sao_Paulo
  // (combineTodayTimeSaoPaulo). Não existe agendamento com data futura
  // neste MVP.
  requestedTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  pickupNote: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export type CreatePickupInput = z.input<typeof createPickupSchema>;

// Cria um atendimento de retirada (módulo Retiradas, 2026-08-14) — mesmo
// racional transacional de openTable.ts, mas sem mesa: não existe a regra
// de "só um atendimento ativo por vez" (várias retiradas convivem
// normalmente), só o número sequencial (pickupNumber, "RETIRADA #047")
// que precisa ser único por restaurante e nunca reiniciar (decisão do
// usuário 2026-08-14). Calculado dentro da transação (MAX + 1), mesmo
// padrão de Order.sequenceNumber — com retry em conflito de unicidade
// (corrida rara de duas retiradas quase simultâneas).
async function runTransaction(data: z.infer<typeof createPickupSchema>) {
  return prisma.$transaction(
    async (tx) => {
      const last = await tx.serviceSession.findFirst({
        where: { restaurantId: data.restaurantId, pickupNumber: { not: null } },
        orderBy: { pickupNumber: "desc" },
        select: { pickupNumber: true },
      });
      const pickupNumber = (last?.pickupNumber ?? 0) + 1;

      return tx.serviceSession.create({
        data: {
          restaurantId: data.restaurantId,
          type: "PICKUP",
          waiterId: data.waiterId,
          // Não existe "pessoas" em retirada — 1 fixo, mesmo racional de
          // não expor um campo que não se aplica (guestCount é usado só
          // para divisão de conta/resumo, sempre 1 aqui).
          guestCount: 1,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          pickupOrigin: data.pickupOrigin,
          requestedAt: data.requestedTime ? combineTodayTimeSaoPaulo(data.requestedTime) : undefined,
          pickupNote: data.pickupNote,
          pickupNumber,
        },
      });
    },
    {
      // Serializable: mesmo racional de create-order.ts — reduz a janela
      // de corrida em pickupNumber quando duas retiradas são abertas quase
      // ao mesmo tempo.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2034" || error.code === "P2028";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /could not serialize|deadlock detected/i.test(error.message);
  }
  return false;
}

export async function createPickup(input: CreatePickupInput) {
  const data = createPickupSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const session = await runTransaction(data);
      await runAfterResponse(() => publishChange(sessionRealtimeChannels(session), "pickup.opened"));
      return session;
    } catch (error) {
      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível criar a retirada.");
}
