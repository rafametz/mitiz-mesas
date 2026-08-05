import "server-only";
import { z } from "zod";
import { MeatPoint, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateSessionTotals } from "@/application/service-session/recalculate-totals";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, sectorChannel, tableChannel } from "@/lib/realtime/channels";

export class CreateOrderError extends Error {}

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Quantidade mínima é 1").max(50),
  guestId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  meatPoint: z.nativeEnum(MeatPoint).optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  modifierIds: z.array(z.string()).max(20).default([]),
});

const createOrderSchema = z.object({
  serviceSessionId: z.string().min(1),
  waiterId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  items: z.array(orderItemSchema).min(1, "Adicione ao menos um item ao pedido"),
});

export type CreateOrderItemInput = z.input<typeof orderItemSchema>;
export type CreateOrderInput = {
  serviceSessionId: string;
  waiterId: string;
  idempotencyKey: string;
  items: CreateOrderItemInput[];
};

const orderInclude = { items: { include: { modifiers: true } } } satisfies Prisma.OrderInclude;

async function runTransaction(data: z.infer<typeof createOrderSchema>) {
  return prisma.$transaction(
    async (tx) => {
      // Idempotência (regra 18/19): mesma chave já usada -> devolve o
      // pedido existente em vez de duplicar ou dar erro.
      const existing = await tx.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: orderInclude,
      });
      if (existing) return { order: existing, created: false as const };

      const session = await tx.serviceSession.findUniqueOrThrow({
        where: { id: data.serviceSessionId },
        include: { table: true },
      });
      if (session.status !== "OPEN") {
        throw new CreateOrderError("Esta mesa não está com atendimento aberto para novos pedidos.");
      }

      const guestIds = [...new Set(data.items.map((i) => i.guestId).filter(Boolean))] as string[];
      if (guestIds.length > 0) {
        const guestCount = await tx.guest.count({
          where: { id: { in: guestIds }, serviceSessionId: data.serviceSessionId },
        });
        if (guestCount !== guestIds.length) {
          throw new CreateOrderError("Uma das pessoas selecionadas não pertence a esta mesa.");
        }
      }

      // Validação de disponibilidade e preço no servidor — nunca confiar
      // no que veio do cliente (CLAUDE.md seção 9, "Enviar para produção").
      const productIds = [...new Set(data.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, restaurantId: session.table.restaurantId },
      });
      const productsById = new Map(products.map((p) => [p.id, p]));

      for (const item of data.items) {
        const product = productsById.get(item.productId);
        if (!product) throw new CreateOrderError("Um dos produtos selecionados não existe.");
        if (!product.active || !product.available) {
          throw new CreateOrderError(`"${product.name}" não está disponível no momento.`);
        }
      }

      const allModifierIds = [...new Set(data.items.flatMap((i) => i.modifierIds))];
      const modifiers = allModifierIds.length
        ? await tx.productModifier.findMany({
            where: { id: { in: allModifierIds } },
            include: { group: true },
          })
        : [];
      const modifiersById = new Map(modifiers.map((m) => [m.id, m]));

      for (const item of data.items) {
        for (const modifierId of item.modifierIds) {
          const modifier = modifiersById.get(modifierId);
          if (!modifier || modifier.group.productId !== item.productId) {
            throw new CreateOrderError("Um dos adicionais selecionados não pertence ao produto.");
          }
          if (!modifier.active) {
            throw new CreateOrderError(`Adicional "${modifier.name}" não está mais disponível.`);
          }
        }
      }

      // Respeita obrigatoriedade/mínimo/máximo de cada grupo de
      // adicionais do produto — validação real de negócio, não só de UI
      // (CLAUDE.md regra 24).
      const groups = await tx.productModifierGroup.findMany({
        where: { productId: { in: productIds }, active: true },
      });
      const groupsByProduct = new Map<string, typeof groups>();
      for (const group of groups) {
        const list = groupsByProduct.get(group.productId) ?? [];
        list.push(group);
        groupsByProduct.set(group.productId, list);
      }

      for (const item of data.items) {
        const productGroups = groupsByProduct.get(item.productId) ?? [];
        for (const group of productGroups) {
          const selectedCount = item.modifierIds.filter(
            (id) => modifiersById.get(id)?.groupId === group.id,
          ).length;

          if (group.required && selectedCount === 0) {
            throw new CreateOrderError(`Selecione uma opção em "${group.name}".`);
          }
          if (selectedCount < group.minSelect) {
            throw new CreateOrderError(
              `Selecione ao menos ${group.minSelect} opção(ões) em "${group.name}".`,
            );
          }
          if (selectedCount > group.maxSelect) {
            throw new CreateOrderError(
              `Selecione no máximo ${group.maxSelect} opção(ões) em "${group.name}".`,
            );
          }
        }
      }

      const lastOrder = await tx.order.findFirst({
        where: { serviceSessionId: data.serviceSessionId },
        orderBy: { sequenceNumber: "desc" },
      });
      const sequenceNumber = (lastOrder?.sequenceNumber ?? 0) + 1;

      const order = await tx.order.create({
        data: {
          serviceSessionId: data.serviceSessionId,
          waiterId: data.waiterId,
          sequenceNumber,
          status: "SENT",
          idempotencyKey: data.idempotencyKey,
          sentAt: new Date(),
          items: {
            create: data.items.map((item) => {
              const product = productsById.get(item.productId)!;
              return {
                productId: item.productId,
                sectorId: product.defaultSectorId,
                guestId: item.guestId,
                productNameAtOrder: product.name,
                unitPrice: product.price,
                quantity: item.quantity,
                meatPoint: item.meatPoint,
                notes: item.notes,
                status: "SENT",
                modifiers: {
                  create: item.modifierIds.map((modifierId) => {
                    const modifier = modifiersById.get(modifierId)!;
                    return {
                      modifierId,
                      modifierNameAtOrder: modifier.name,
                      priceDeltaAtOrder: modifier.priceDelta,
                    };
                  }),
                },
              };
            }),
          },
        },
        include: orderInclude,
      });

      await recalculateSessionTotals(tx, data.serviceSessionId);

      return {
        order,
        created: true as const,
        tableId: session.tableId,
        restaurantId: session.table.restaurantId,
        sectorIds: [...new Set(order.items.map((item) => item.sectorId))],
      };
    },
    // Serializable: reduz a janela de corrida em sequenceNumber quando
    // dois pedidos são enviados quase ao mesmo tempo para a mesma mesa
    // (CLAUDE.md — "tratar concorrência"). Retry em runCreateOrder abaixo
    // cobre o caso raro de falha de serialização.
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint (ex.: sequenceNumber ou idempotencyKey em
    // corrida). P2034: conflito de escrita/deadlock sob isolamento
    // Serializable — o próprio Prisma recomenda tentar de novo.
    return error.code === "P2002" || error.code === "P2034";
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /could not serialize|deadlock detected/i.test(error.message);
  }
  return false;
}

export async function createOrder(input: CreateOrderInput) {
  const data = createOrderSchema.parse(input);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await runTransaction(data);

      // Só publica quando este pedido foi de fato criado agora — uma
      // repetição idempotente (regra 18/19) não é uma mudança nova para
      // avisar ninguém; quem criou de verdade já publicou.
      if (result.created) {
        await publishChange(
          [
            tableChannel(result.tableId),
            restaurantTablesChannel(result.restaurantId),
            ...result.sectorIds.map(sectorChannel),
          ],
          "order.created",
        );
      }

      return result.order;
    } catch (error) {
      if (error instanceof CreateOrderError) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: orderInclude,
        });
        if (existing) return existing;
      }

      if (attempt < 3 && isRetryableConflict(error)) continue;
      throw error;
    }
  }

  // Inalcançável (o loop sempre retorna ou lança) — só para o TypeScript.
  throw new Error("Não foi possível criar o pedido.");
}
