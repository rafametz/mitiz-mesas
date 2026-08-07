import "server-only";
import { z } from "zod";
import { MeatPoint, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateSessionTotals } from "@/application/service-session/recalculate-totals";
import { createPrintJobsForOrder } from "@/application/printing/create-print-jobs";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, sectorChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

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

const orderInclude = {
  items: { include: { modifiers: true, guest: true } },
} satisfies Prisma.OrderInclude;

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
        include: { table: { include: { restaurant: true } } },
      });
      if (session.status !== "OPEN") {
        throw new CreateOrderError("Esta mesa não está com atendimento aberto para novos pedidos.");
      }

      const waiter = await tx.user.findUniqueOrThrow({ where: { id: data.waiterId } });

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

      await recalculateSessionTotals(tx, data.serviceSessionId, session);

      // Fila de impressão e publicação de tempo real NÃO entram mais
      // aqui dentro — são efeito colateral não crítico (mesmo racional
      // já usado em open-table.ts para publishChange), e o garçom não
      // deveria esperar nenhum dos dois pra saber que o pedido foi
      // gravado (docs/performance/optimization-plan.md, Fase 2). Quem
      // chama createOrder() agenda os dois via after() depois que esta
      // transação já commitou.
      return {
        order,
        created: true as const,
        tableId: session.tableId,
        restaurantId: session.table.restaurantId,
        restaurantName: session.table.restaurant.name,
        tableNumber: session.table.number,
        waiterName: waiter.name,
        sectorIds: [...new Set(order.items.map((item) => item.sectorId))],
      };
    },
    {
      // Serializable: reduz a janela de corrida em sequenceNumber quando
      // dois pedidos são enviados quase ao mesmo tempo para a mesma mesa
      // (CLAUDE.md — "tratar concorrência"). Retry em runCreateOrder abaixo
      // cobre o caso raro de falha de serialização.
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      // Timeout maior que o padrão (5s): esta transação faz várias
      // idas e vindas (validações + pedido + totais + print jobs) via
      // pooler do Supabase (PgBouncer). Em produção (Vercel -> Supabase),
      // a latência de rede real às vezes passa de 5s e o motor expira a
      // transação, gerando P2028 ("Transaction not found") mesmo sem
      // nenhum problema de dados (confirmado em produção 2026-08-06,
      // Mesa 2, reproduzido com debug ligado).
      maxWait: 5000,
      timeout: 15000,
    },
  );
}

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint (ex.: sequenceNumber ou idempotencyKey em
    // corrida). P2034: conflito de escrita/deadlock sob isolamento
    // Serializable — o próprio Prisma recomenda tentar de novo. P2028:
    // transação interativa expirou/perdeu a conexão no pooler — o timeout
    // maior acima deve evitar a maioria dos casos, mas se acontecer vale
    // tentar de novo (nada foi commitado).
    return error.code === "P2002" || error.code === "P2034" || error.code === "P2028";
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

      // Só dispara os dois quando este pedido foi de fato criado agora —
      // uma repetição idempotente (regra 18/19) não é uma mudança nova
      // pra avisar ninguém nem pra imprimir de novo; quem criou de
      // verdade já fez isso. runAfterResponse (ver src/lib/) garante que
      // os dois rodem até o fim mesmo depois da resposta já ter sido
      // entregue ao garçom, sem bloquear a resposta em si.
      if (result.created) {
        const printJobParams = {
          order: result.order,
          restaurantId: result.restaurantId,
          restaurantName: result.restaurantName,
          tableNumber: result.tableNumber,
          waiterName: result.waiterName,
        };
        const channels = [
          tableChannel(result.tableId),
          restaurantTablesChannel(result.restaurantId),
          ...result.sectorIds.map(sectorChannel),
        ];

        await runAfterResponse(async () => {
          try {
            await createPrintJobsForOrder(prisma, printJobParams);
          } catch (error) {
            // O pedido já está confirmado e válido — uma falha aqui
            // significa que o setor não vai ter o ticket impresso desta
            // vez. Fica registrado no log do servidor (Vercel > Logs)
            // pra investigar; não existe hoje uma varredura automática
            // de "pedido sem PrintJob" (CLAUDE.md seção 20 pede
            // estratégia de reprocessamento — a fila de impressão já
            // tem reprocessar/reimprimir manual em /impressao, mas isso
            // exige o PrintJob existir primeiro).
            console.error(
              `[createOrder] falha ao criar PrintJob do pedido ${result.order.id}:`,
              error,
            );
          }
        });

        await runAfterResponse(() => publishChange(channels, "order.created"));
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
