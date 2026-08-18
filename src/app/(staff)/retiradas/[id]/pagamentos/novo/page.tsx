import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getPickupSession } from "@/application/service-session/get-pickup-with-session";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { canRegisterPayment } from "@/domain/service-session/closing";
import { buildPayableLines } from "@/domain/payment/item-allocation";
import { PageHeader } from "@/components/ui/card";
import { ZERO } from "@/lib/money";
import { PaymentSelectionForm } from "../../../../mesas/[id]/pagamentos/payment-selection-form";
import { toClientPayableLines } from "../../../../mesas/[id]/pagamentos/payment-selection-lines";

// Mesma tela de seleção de consumo das mesas (PaymentSelectionForm) — só
// muda a origem da sessão e não há pessoas pra selecionar (retirada é
// sempre um único cliente). Módulo Retiradas + ADR 0006, 2026-08-15.
export default async function NovoPagamentoRetiradaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission(PERMISSIONS.PAYMENTS_REGISTER);
  const session = await getPickupSession(id);
  const redirectPath = `/retiradas/${id}`;

  if (!canRegisterPayment(session.status) || !session.balanceAmount.greaterThan(ZERO)) {
    redirect(`${redirectPath}/pagamentos`);
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Novo pagamento" subtitle={`Retirada #${session.pickupNumber}`} />
      <PaymentSelectionForm
        redirectPath={redirectPath}
        sessionId={session.id}
        lines={toClientPayableLines(payableLines)}
        paymentMethods={paymentMethods}
        guests={[]}
        guestCount={session.guestCount}
        balance={session.balanceAmount.toString()}
      />
    </div>
  );
}
