import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { hasAnyPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { SERVICE_SESSION_STATUS_LABELS } from "@/domain/service-session/labels";
import { buildConsolidatedSummary } from "@/domain/order/consolidated-summary";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryField } from "@/components/ui/summary-field";
import { SERVICE_SESSION_STATUS_TONE } from "@/components/ui/status-tone";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { PrintBillSummaryButton } from "../../../print-bill-summary-button";

// Detalhe de um atendimento encerrado (pedido do usuário, Módulo 10):
// itens consumidos, pessoas e valores pagos — a mesma informação que dava
// pra ver na mesa enquanto ela estava aberta, só que depois de fechada.
// Não é uma tela "ao vivo" (sem RealtimeRefresh de propósito): atendimento
// encerrado não muda mais.
export default async function HistoricoDetalhePage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;
  const user = await requireUser();
  // "Imprimir conferência" (CLAUDE.md seção 10) — mesma permissão da tela
  // da mesa aberta (pedido do usuário: poder reimprimir o resumo de um
  // atendimento já encerrado pra conferência ou lançamento manual em
  // outro sistema, ex.: futura integração com o PDV).
  const canPrintBillSummary = hasAnyPermission(user.permissions, [
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ]);

  const session = await prisma.serviceSession.findUnique({
    where: { id: sessionId },
    include: {
      table: true,
      waiter: true,
      guests: { orderBy: { sortOrder: "asc" } },
      orders: {
        include: { items: { include: { modifiers: true } } },
      },
      payments: {
        where: { voidedAt: null },
        orderBy: { createdAt: "asc" },
        include: { paymentMethod: true, guest: true, registeredBy: true },
      },
      discounts: { where: { voidedAt: null }, include: { appliedBy: true } },
      serviceCharges: { orderBy: { createdAt: "desc" }, take: 1, include: { appliedBy: true } },
    },
  });

  // tableId errado (URL adulterada/copiada de outra mesa) é tratado igual a
  // "não existe" — não vaza que o id de sessão existe em outra mesa.
  if (!session || session.tableId !== id) notFound();

  const consolidated = buildConsolidatedSummary(
    session.orders.flatMap((order) =>
      order.items.map((item) => ({
        productId: item.productId,
        productNameAtOrder: item.productNameAtOrder,
        meatPoint: item.meatPoint,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        status: item.status,
        modifiers: item.modifiers.map((m) => ({
          modifierNameAtOrder: m.modifierNameAtOrder,
          priceDeltaAtOrder: m.priceDeltaAtOrder,
          quantity: m.quantity,
        })),
      })),
    ),
  );

  const latestServiceCharge = session.serviceCharges[0];
  const activeDiscount = session.discounts[0];

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={SERVICE_SESSION_STATUS_TONE[session.status]}>
          {SERVICE_SESSION_STATUS_LABELS[session.status]}
        </StatusBadge>
        <span className="text-xs text-muted">
          {formatDateTime(session.openedAt)} até{" "}
          {session.closedAt ? formatDateTime(session.closedAt) : "-"} · Garçom:{" "}
          {session.waiter.name}
        </span>
      </div>

      {session.status === "CANCELLED" && session.cancelReason && (
        <Card padding="sm" className="border-wine/30 bg-wine/5 text-sm text-wine">
          Atendimento cancelado: {session.cancelReason}
        </Card>
      )}

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Resumo financeiro</h2>
          {canPrintBillSummary && (
            <PrintBillSummaryButton redirectPath={`/mesas/${id}/historico/${sessionId}`} sessionId={session.id} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryField label="Subtotal" value={formatBRL(session.subtotalAmount)} />
          <SummaryField label="Taxa de serviço" value={formatBRL(session.serviceChargeAmount)} />
          <SummaryField label="Desconto" value={formatBRL(session.discountAmount)} />
          <SummaryField label="Total" value={formatBRL(session.totalAmount)} />
          <SummaryField label="Pago" value={formatBRL(session.paidAmount)} />
          <SummaryField label="Saldo" value={formatBRL(session.balanceAmount)} emphasis />
        </div>
        {latestServiceCharge && (
          <p className="mt-3 text-xs text-muted">
            {latestServiceCharge.waived
              ? `Taxa de serviço retirada por ${latestServiceCharge.appliedBy.name}${latestServiceCharge.waivedReason ? `: ${latestServiceCharge.waivedReason}` : ""}.`
              : `Taxa de serviço de ${latestServiceCharge.percent.toString()}% aplicada por ${latestServiceCharge.appliedBy.name}.`}
          </p>
        )}
        {activeDiscount && (
          <p className="mt-1 text-xs text-muted">
            Desconto ({activeDiscount.reason}) aplicado por {activeDiscount.appliedBy.name}.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Pessoas</h2>
        {session.guests.length === 0 ? (
          <p className="text-sm text-muted">Nenhum nome informado.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {session.guests.map((guest) => (
              <span key={guest.id} className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink">
                {guest.name ?? "Sem nome"}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{session.guestCount} pessoa(s) no atendimento.</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Itens consumidos</h2>
        {consolidated.lines.length === 0 ? (
          <p className="text-sm text-muted">Nenhum item lançado neste atendimento.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5 text-sm">
              {consolidated.lines.map((line) => (
                <li key={line.key} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink">
                    {line.quantity}x {line.label}
                  </span>
                  <span className="tabular shrink-0 text-muted">{formatBRL(line.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
              <span>Total</span>
              <span className="tabular font-display text-base">
                {formatBRL(consolidated.total)}
              </span>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Pagamentos</h2>
        {session.payments.length === 0 ? (
          <p className="text-sm text-muted">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {session.payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-2 border-b border-line/60 pb-2 last:border-b-0 last:pb-0"
              >
                <div>
                  <div className="text-ink">
                    {payment.paymentMethod.name} ·{" "}
                    <span className="tabular font-medium">{formatBRL(payment.amount)}</span>
                    {payment.guest && (
                      <span className="text-muted"> · {payment.guest.name ?? "pessoa sem nome"}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTime(payment.createdAt)} · {payment.registeredBy.name}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
