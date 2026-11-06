import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { PageHeader } from "@/components/ui/card";
import { buildPayableLines } from "@/domain/payment/item-allocation";
import { formatSessionLabel } from "@/domain/service-session/labels";
import { ZERO } from "@/lib/money";
import { AtendimentoTabs } from "../atendimento-tabs";
import { toClientPayableLines } from "../mesas/[id]/pagamentos/payment-selection-lines";
import { PdvSaleScreen } from "./pdv-sale-screen";

// Venda de balcão (Módulo 17, docs/backlog.md — Fase 2 do roadmap MITIZ
// Gestão, 2026-10-20): catálogo inteiro disponível aqui (não só a
// categoria Loja — `category.visibleInOrders` é sobre esconder a Loja do
// pedido de MESA, não sobre restringir o PDV; o pedido original da Fase 1
// já define o cadastro de produtos como catálogo único e compartilhado).
export default async function PdvPage() {
  await requirePermission(PERMISSIONS.PDV_SELL);
  const restaurant = await getCurrentRestaurant();

  const [products, paymentMethods, consumptionSessions] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId: restaurant.id, active: true, available: true },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.paymentMethod.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    // Mesas E retiradas com saldo em aberto — candidatas a "+ Adicionar
    // consumo de mesa ou retirada" (ADR 0010, Pagamento Combinado;
    // ampliado pra retirada em 2026-11-06, pedido do usuário: cliente
    // que já tinha uma retirada aberta volta ao balcão e compra mais
    // alguma coisa). Escala pequena (CLAUDE.md: "6 a 8 mesas", retiradas
    // na mesma ordem de grandeza), então computar a seleção de consumo
    // de todas de uma vez na carga da página é mais simples e barato do
    // que buscar sob demanda — mesmo padrão já usado em
    // TransferTableForm (freeTables carregadas no servidor, não num
    // endpoint à parte).
    prisma.serviceSession.findMany({
      where: {
        restaurantId: restaurant.id,
        type: { in: ["TABLE", "PICKUP"] },
        status: { in: ["OPEN", "CLOSING"] },
        balanceAmount: { gt: ZERO },
      },
      include: {
        table: true,
        orders: {
          include: {
            items: {
              where: { status: { not: "CANCELLED" } },
              include: {
                modifiers: true,
                guest: true,
                allocations: { include: { payment: { select: { voidedAt: true } } } },
              },
            },
          },
        },
      },
      orderBy: [{ table: { number: "asc" } }, { pickupNumber: "asc" }],
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 pt-6 lg:gap-5">
      <AtendimentoTabs active="pdv" canSellPdv />
      <PageHeader title="PDV" subtitle="Venda de balcão" />

      {products.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum produto disponível. Cadastre produtos em Administração antes de vender.
        </p>
      ) : (
        <PdvSaleScreen
          restaurantId={restaurant.id}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
            price: product.price.toString(),
            sku: product.sku,
            barcode: product.barcode,
            categoryId: product.categoryId,
            categoryName: product.category.name,
          }))}
          paymentMethods={paymentMethods.map((method) => ({ id: method.id, name: method.name }))}
          consumptionOptions={consumptionSessions
            .map((session) => {
              const items = session.orders.flatMap((order) => order.items);
              const lines = buildPayableLines(
                items.map((item) => ({
                  id: item.id,
                  productId: item.productId,
                  productNameAtOrder: item.productNameAtOrder,
                  meatPoint: item.meatPoint,
                  guestId: item.guestId,
                  guestName: item.guest?.name ?? null,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  modifiers: item.modifiers,
                  openShareParts: item.openShareParts,
                  openShareBaseAmount: item.openShareBaseAmount,
                  createdAt: item.createdAt,
                  allocations: item.allocations.map((a) => ({
                    kind: a.kind,
                    quantity: a.quantity,
                    amount: a.amount,
                    voided: a.payment.voidedAt !== null,
                  })),
                })),
              );
              // Mesa usa o id da própria mesa na rota (/mesas/{tableId});
              // retirada usa o id da sessão direto (/retiradas/{sessionId}
              // — não tem mesa). `redirectPath` é só pra revalidação
              // (ShareItemForm, "Dividir"/"Redistribuir" dentro do
              // seletor), nunca navegado de fato a partir do PDV.
              const redirectPath =
                session.type === "TABLE" ? `/mesas/${session.tableId}` : `/retiradas/${session.id}`;
              return {
                sessionId: session.id,
                kind: session.type === "TABLE" ? ("table" as const) : ("pickup" as const),
                label: formatSessionLabel(session, session.table?.number),
                redirectPath,
                balance: session.balanceAmount.toString(),
                guestCount: session.guestCount,
                lines: toClientPayableLines(lines),
              };
            })
            // Mesas primeiro (ordem numérica já veio do orderBy acima),
            // retiradas depois — não dá pra confiar na ordem alfabética do
            // enum (`type: "asc"` colocaria PICKUP antes de TABLE).
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "table" ? -1 : 1))}
        />
      )}
    </main>
  );
}
