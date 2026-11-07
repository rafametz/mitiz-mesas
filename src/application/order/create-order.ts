import "server-only";
import { z } from "zod";
import { MeatPoint, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDecimal } from "@/lib/money";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { recalculateSessionTotals } from "@/application/service-session/recalculate-totals";
import { sessionRealtimeChannels } from "@/application/service-session/session-realtime";
import { createPrintJobsForOrder } from "@/application/printing/create-print-jobs";
import { buildTicketHeader } from "@/application/printing/ticket-header";
import { publishChange } from "@/lib/realtime/publish";
import { sectorChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

export class CreateOrderError extends Error {}

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Quantidade mínima é 1").max(50),
  // Venda por peso no PDV (balança, pedido do usuário 2026-11-07) — kg,
  // até 3 casas decimais. Ausente = item comum, comportamento de sempre.
  // Validado de verdade (sessão PDV + produto `unit = "KG"` + quantity
  // sempre 1 quando presente) dentro de createOrderInTx, nunca só aqui —
  // mesa e retirada nunca enviam isto, continuam com quantidade inteira
  // fixa (decisão explícita do usuário: peso é só no PDV).
  weightQuantity: z.coerce
    .number()
    .positive("Peso deve ser maior que zero")
    .max(999.999)
    .optional(),
  // Preço promocional por kg no momento do lançamento (pedido do usuário
  // 2026-11-08: "às vezes tem uma carne que é R$99,90 o quilo, só que
  // naquele dia tem uma promoção... eu gostaria de aplicar esse desconto
  // no lançamento") — só junto com weightQuantity, nunca maior que o
  // preço de tabela do produto (é uma ferramenta de desconto, não um
  // editor de preço livre). Igual ao desconto da venda inteira
  // (sell-pdv.ts), exige DISCOUNTS_APPLY (checado em actions.ts, não
  // aqui — esta camada não tem o usuário/permissões, só a regra de dado)
  // e motivo opcional.
  weightUnitPriceOverride: z.coerce.number().positive().optional(),
  weightUnitPriceOverrideReason: z.string().trim().max(300).optional(),
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

// Exportado (ADR 0010 — Pagamento Combinado): o orquestrador de checkout
// combinado precisa montar/validar os dados do pedido do PDV fora desta
// função, antes de compor `createOrderInTx` dentro da própria transação
// dele.
export const createOrderSchema = z.object({
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

// Núcleo da criação do pedido, parametrizado numa transação já aberta
// (ADR 0010 — Pagamento Combinado): extraído de dentro de `runTransaction`
// pra poder ser composto junto com `registerPaymentInTx` dentro da MESMA
// transação do checkout combinado (mesa + PDV), sem duplicar nenhuma
// regra. `createOrder` (abaixo) continua se comportando exatamente igual
// — só passou a abrir a transação e chamar isto por dentro, em vez de ter
// o corpo inline. Isolamento/timeout/retry continuam responsabilidade de
// quem abre a transação (aqui, `runTransaction`; no checkout combinado,
// o orquestrador novo).
export async function createOrderInTx(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof createOrderSchema>,
) {
  // Idempotência (regra 18/19): mesma chave já usada -> devolve o
  // pedido existente em vez de duplicar ou dar erro.
  const existing = await tx.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: orderInclude,
  });
  if (existing) return { order: existing, created: false as const };

  const session = await tx.serviceSession.findUniqueOrThrow({
    where: { id: data.serviceSessionId },
    include: { table: true, restaurant: true },
  });
  if (session.status !== "OPEN") {
    throw new CreateOrderError("Este atendimento não está aberto para novos pedidos.");
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
    where: { id: { in: productIds }, restaurantId: session.restaurantId },
  });
  const productsById = new Map(products.map((p) => [p.id, p]));

  for (const item of data.items) {
    const product = productsById.get(item.productId);
    if (!product) throw new CreateOrderError("Um dos produtos selecionados não existe.");
    if (!product.active || !product.available) {
      throw new CreateOrderError(`"${product.name}" não está disponível no momento.`);
    }

    if (item.weightQuantity !== undefined) {
      if (session.type !== "PDV") {
        throw new CreateOrderError("Venda por peso só é permitida no PDV.");
      }
      if (product.unit !== "KG") {
        throw new CreateOrderError(`"${product.name}" não é vendido por peso.`);
      }
      if (item.quantity !== 1) {
        throw new CreateOrderError("Item vendido por peso deve ter quantidade 1.");
      }
      if (toDecimal(item.weightQuantity).decimalPlaces() > 3) {
        throw new CreateOrderError("Peso aceita no máximo 3 casas decimais.");
      }
    }

    if (item.weightUnitPriceOverride !== undefined) {
      if (item.weightQuantity === undefined) {
        throw new CreateOrderError("Preço promocional só se aplica a item vendido por peso.");
      }
      if (toDecimal(item.weightUnitPriceOverride).greaterThan(product.price)) {
        throw new CreateOrderError(
          `O preço promocional de "${product.name}" não pode ser maior que o preço de tabela (R$ ${product.price.toFixed(2)}/kg).`,
        );
      }
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
          // Peso (PDV, produto `unit = "KG"`, validado acima): quantity
          // sempre 1, unitPrice vira o TOTAL congelado daquela pesagem
          // (peso × preço/kg efetivo no momento do lançamento) — preserva
          // o invariante unitPrice × quantity = total da linha em todo o
          // resto do sistema. weightUnitPriceAtOrder guarda o preço por
          // kg efetivamente cobrado (de tabela, ou o promocional quando
          // informado) só pra exibir no recibo/ticket.
          const weightQuantity =
            item.weightQuantity !== undefined ? toDecimal(item.weightQuantity) : null;
          const weightUnitPrice =
            item.weightUnitPriceOverride !== undefined
              ? toDecimal(item.weightUnitPriceOverride)
              : product.price;
          const unitPrice = weightQuantity
            ? weightUnitPrice.times(weightQuantity).toDecimalPlaces(2)
            : product.price;
          return {
            productId: item.productId,
            sectorId: product.defaultSectorId,
            guestId: item.guestId,
            productNameAtOrder: product.name,
            unitPrice,
            quantity: item.quantity,
            weightQuantity,
            weightUnitPriceAtOrder: weightQuantity ? weightUnitPrice : null,
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

  // Auditoria do preço promocional (regra 14 — desconto registra tipo,
  // valor, motivo e usuário) — um registro por item que usou
  // weightUnitPriceOverride, nunca um resumo só. order.items preserva a
  // mesma ordem de data.items (nested create do Prisma cria e devolve na
  // ordem do array), daí o índice casar os dois sem precisar comparar
  // productId (que pode repetir se o mesmo produto foi pesado mais de
  // uma vez no mesmo pedido).
  for (const [index, item] of data.items.entries()) {
    if (item.weightUnitPriceOverride === undefined) continue;
    const product = productsById.get(item.productId)!;
    const createdItem = order.items[index]!;
    const reason = item.weightUnitPriceOverrideReason?.trim() || "Sem motivo informado";
    await writeAuditLog(tx, {
      restaurantId: session.restaurantId,
      userId: data.waiterId,
      tableId: null,
      action: "order_item.weight_price_override",
      entityType: "OrderItem",
      entityId: createdItem.id,
      metadata: {
        productId: product.id,
        productName: product.name,
        weightQuantity: item.weightQuantity?.toString(),
        catalogUnitPrice: product.price.toString(),
        overrideUnitPrice: item.weightUnitPriceOverride.toString(),
        reason,
      },
    });
  }

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
    session,
    restaurantId: session.restaurantId,
    restaurantName: session.restaurant.name,
    header: buildTicketHeader(session, session.table?.number ?? null),
    waiterName: waiter.name,
    responsibleName: session.responsibleName,
    sectorIds: [...new Set(order.items.map((item) => item.sectorId))],
  };
}

// Opções de transação usadas tanto aqui (sozinho) quanto pelo orquestrador
// do checkout combinado (ADR 0010) — mesmo racional documentado abaixo,
// um único lugar pra não divergir.
export const createOrderTransactionOptions = {
  // Serializable: reduz a janela de corrida em sequenceNumber quando
  // dois pedidos são enviados quase ao mesmo tempo para a mesma mesa
  // (CLAUDE.md — "tratar concorrência"). Retry em createOrder abaixo
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
} satisfies Parameters<typeof prisma.$transaction>[1];

function runTransaction(data: z.infer<typeof createOrderSchema>) {
  return prisma.$transaction((tx) => createOrderInTx(tx, data), createOrderTransactionOptions);
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
          header: result.header,
          waiterName: result.waiterName,
          responsibleName: result.responsibleName,
        };
        const channels = [
          ...sessionRealtimeChannels(result.session),
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
