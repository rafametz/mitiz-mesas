import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { canRegisterPayment } from "@/domain/service-session/closing";
import { formatSessionLabel } from "@/domain/service-session/labels";
import { buildPayableLines } from "@/domain/payment/item-allocation";
import { PageHeader } from "@/components/ui/card";
import { ZERO } from "@/lib/money";
import { PaymentSelectionForm } from "../payment-selection-form";
import { toClientPayableLines } from "../payment-selection-lines";

// Pagamento por itens e rateio de consumo (2026-08-15, ADR 0006) — página
// dedicada (mesmo padrão de /pedidos/novo), fora da tela de pagamentos
// principal por ser potencialmente longa (uma linha por item em aberto).
export default async function NovoPagamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const { table, session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);
  if (!canRegisterPayment(session.status) || !session.balanceAmount.greaterThan(ZERO)) {
    redirect(`/mesas/${id}/pagamentos`);
  }

  const restaurant = await getCurrentRestaurant();
  const [items, paymentMethods] = await Promise.all([
    prisma.orderItem.findMany({
      where: { order: { serviceSessionId: session.id }, status: { not: "CANCELLED" } },
      include: {
        modifiers: true,
        guest: true,
        allocations: { include: { payment: { select: { voidedAt: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.paymentMethod.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const payableLines = buildPayableLines(
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

  const activeGuests = session.guests.filter((g) => g.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Novo pagamento" subtitle={formatSessionLabel(session, table.number)} />
      <PaymentSelectionForm
        redirectPath={`/mesas/${id}`}
        sessionId={session.id}
        lines={toClientPayableLines(payableLines)}
        paymentMethods={paymentMethods}
        guests={activeGuests.map((g, i) => ({ id: g.id, name: g.name ?? `Pessoa ${i + 1}` }))}
        guestCount={session.guestCount}
        balance={session.balanceAmount.toString()}
      />
    </div>
  );
}
