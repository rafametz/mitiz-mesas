import { redirect } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import {
  canCloseTable,
  canModifyClosingCharges,
  canRegisterPayment,
} from "@/domain/service-session/closing";
import { splitEqually, type SplitItemInput } from "@/domain/service-session/split";
import { deriveGuestParticipation } from "@/domain/service-session/guest-participation";
import { DISCOUNT_TYPE_LABELS, formatSessionLabel } from "@/domain/service-session/labels";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { GUEST_STATUS_TONE } from "@/components/ui/status-tone";
import { SummaryField } from "@/components/ui/summary-field";
import { ReasonConfirmForm } from "@/components/form/reason-confirm-form";
import { formatDateTime } from "@/lib/datetime";
import { formatBRL, sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { voidDiscountAction, voidPaymentAction } from "./actions";
import { ApplyDiscountForm } from "./apply-discount-form";
import { CancelClosingRequestButton } from "./cancel-closing-request-button";
import { CloseTableButton } from "./close-table-button";
import { GuestSettleButton } from "./guest-settle-button";
import { RegisterPaymentForm } from "./register-payment-form";
import { RequestClosingButton } from "./request-closing-button";
import { ServiceChargeForm } from "./service-charge-form";

export default async function PagamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partes?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { table, session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);

  const restaurant = await getCurrentRestaurant();

  // Pagamento e fechamento são conceitos separados (revisão 2026-08-10):
  // pagamento é possível em qualquer status ativo (OPEN ou CLOSING) — não
  // existe mais um "portão" que esconde a página inteira até o fechamento
  // ser solicitado. Só taxa/desconto/finalizar dependem de CLOSING.
  const [activeDiscount, latestServiceCharge, payments, paymentMethods, items] = await Promise.all([
    prisma.discount.findFirst({
      where: { serviceSessionId: session.id, voidedAt: null },
      include: { appliedBy: true },
    }),
    prisma.serviceCharge.findFirst({
      where: { serviceSessionId: session.id },
      orderBy: { createdAt: "desc" },
      include: { appliedBy: true },
    }),
    prisma.payment.findMany({
      where: { serviceSessionId: session.id, voidedAt: null },
      orderBy: { createdAt: "desc" },
      include: { paymentMethod: true, registeredBy: true, guest: true },
    }),
    prisma.paymentMethod.findMany({
      where: { restaurantId: restaurant.id, active: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.orderItem.findMany({
      where: { order: { serviceSessionId: session.id }, status: { not: "CANCELLED" } },
      include: { modifiers: true },
    }),
  ]);

  const canRequestClosingPermission = hasAnyPermission(user.permissions, [
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.TABLES_CLOSE,
  ]);
  const canModifyCharges =
    hasPermission(user.permissions, PERMISSIONS.DISCOUNTS_APPLY) &&
    canModifyClosingCharges(session.status);
  const canApplyServiceCharge =
    hasAnyPermission(user.permissions, [PERMISSIONS.DISCOUNTS_APPLY, PERMISSIONS.PAYMENTS_REGISTER]) &&
    canModifyClosingCharges(session.status);
  const canRegisterPaymentPermission =
    hasPermission(user.permissions, PERMISSIONS.PAYMENTS_REGISTER) &&
    canRegisterPayment(session.status);
  const canVoidPayment = hasPermission(user.permissions, PERMISSIONS.PAYMENTS_REGISTER);
  const canClosePermission = hasPermission(user.permissions, PERMISSIONS.TABLES_CLOSE);
  const readyToClose = canCloseTable(session.status, session.balanceAmount);

  const activeGuests = session.guests.filter((g) => g.status === "ACTIVE");

  // Divisão da conta: ferramenta de apoio pro caixa (business-rules.md §6,
  // passo 5) — só ajuda a calcular, não grava nada; a divisão de verdade
  // acontece pelos pagamentos que forem registrados abaixo.
  const parts = Math.min(50, Math.max(1, Number(sp.partes) || session.guestCount || 2));
  const hasBalanceToSplit = toDecimal(session.totalAmount).greaterThan(ZERO);
  const equalParts = hasBalanceToSplit ? splitEqually(session.totalAmount, parts) : [];

  const splitItems: SplitItemInput[] = items.map((item) => {
    const modifiersTotal = sumDecimals(
      item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
    );
    const lineTotal = toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);
    return { guestId: item.guestId, label: `${item.quantity}x ${item.productNameAtOrder}`, lineTotal };
  });
  // Pagamento por pessoa (revisão 2026-08-10): consumo + pago + saldo de
  // cada uma, calculado a partir dos pagamentos já vinculados a ela — só
  // exibição, marcar SETTLED continua sendo decisão manual do caixa.
  const guestParticipation =
    hasBalanceToSplit && session.guests.length > 0
      ? deriveGuestParticipation(
          session.guests.map((g) => ({ id: g.id, name: g.name, status: g.status })),
          splitItems,
          payments.map((p) => ({ guestId: p.guestId, amount: p.amount })),
        )
      : [];

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Resumo financeiro: aqui é a tela dedicada a isso, então fica sempre
          aberto (diferente do <details> na tela principal da mesa). */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Resumo financeiro</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryField label="Subtotal" value={formatBRL(session.subtotalAmount)} />
          <SummaryField label="Taxa de serviço" value={formatBRL(session.serviceChargeAmount)} />
          <SummaryField label="Desconto" value={formatBRL(session.discountAmount)} />
          <SummaryField label="Total" value={formatBRL(session.totalAmount)} />
          <SummaryField label="Pago" value={formatBRL(session.paidAmount)} />
          <SummaryField label="Saldo" value={formatBRL(session.balanceAmount)} emphasis />
        </div>
      </Card>

      {/* Fechamento: separado de pagamento de propósito (revisão
          2026-08-10) — pagamento nunca depende disto, só taxa/desconto/
          finalizar dependem. */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Fechamento</h2>
        {session.status === "CLOSING" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">
              Fechamento solicitado. Revise taxa de serviço, desconto e registre o pagamento antes
              de finalizar.
            </p>
            {canRequestClosingPermission && (
              <CancelClosingRequestButton redirectPath={`/mesas/${id}`} sessionId={session.id} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Atendimento aberto. Pedidos continuam sendo aceitos normalmente. Solicite o
              fechamento quando a mesa estiver pronta para encerrar.
            </p>
            {canRequestClosingPermission ? (
              <RequestClosingButton
                redirectPath={`/mesas/${id}`}
                sessionId={session.id}
                itemLabel={formatSessionLabel(session, table.number)}
              />
            ) : (
              <p className="text-xs text-muted">
                Peça para o garçom ou o caixa solicitar o fechamento.
              </p>
            )}
          </div>
        )}
      </Card>

      {canApplyServiceCharge && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-ink">Taxa de serviço</h2>
          <p className="mb-3 text-xs text-muted">
            {latestServiceCharge
              ? latestServiceCharge.waived
                ? `Retirada por ${latestServiceCharge.appliedBy.name}: ${latestServiceCharge.waivedReason}`
                : `Vigente: ${latestServiceCharge.percent.toString()}% (${formatBRL(latestServiceCharge.amountApplied)}), aplicada por ${latestServiceCharge.appliedBy.name}`
              : "Nenhuma taxa aplicada ainda. Opcional (CLAUDE.md regra 15)."}
          </p>
          <ServiceChargeForm
            redirectPath={`/mesas/${id}`}
            sessionId={session.id}
            defaultPercent={latestServiceCharge?.waived ? "0" : (latestServiceCharge?.percent.toString() ?? "10")}
          />
        </Card>
      )}

      {canModifyCharges && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-ink">Desconto</h2>
          {activeDiscount ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink">
                {DISCOUNT_TYPE_LABELS[activeDiscount.type]} de{" "}
                {activeDiscount.type === "PERCENTAGE"
                  ? `${activeDiscount.value.toString()}%`
                  : formatBRL(activeDiscount.value)}{" "}
                <span className="tabular text-muted">
                  (aplicado: {formatBRL(activeDiscount.amountApplied)})
                </span>
              </p>
              <p className="text-xs text-muted">
                {activeDiscount.reason} · {activeDiscount.appliedBy.name}
              </p>
              <ReasonConfirmForm
                action={voidDiscountAction.bind(null, `/mesas/${id}`, activeDiscount.id)}
                triggerLabel="Anular desconto"
                dialogTitle="Anular desconto"
                itemLabel={`Desconto de ${formatBRL(activeDiscount.amountApplied)}`}
                pendingLabel="Anulando..."
                successMessage="Desconto anulado."
              />
            </div>
          ) : (
            <ApplyDiscountForm redirectPath={`/mesas/${id}`} sessionId={session.id} />
          )}
        </Card>
      )}

      {hasBalanceToSplit && (
        <details className="group overflow-hidden rounded-card border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm">
            <span className="font-semibold text-ink">Dividir a conta</span>
            <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-3 py-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Igualmente
              </p>
              <form className="mb-2 flex items-end gap-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted">Em quantas partes</span>
                  <input
                    type="number"
                    name="partes"
                    min={1}
                    max={50}
                    defaultValue={parts}
                    className="h-9 w-20 rounded-control-sm border border-line bg-surface px-2 text-sm text-ink"
                  />
                </label>
                <button
                  type="submit"
                  className="h-9 rounded-control-sm border border-line px-3 text-sm font-medium text-ink hover:bg-ink/5"
                >
                  Calcular
                </button>
              </form>
              <ul className="flex flex-col gap-1 text-sm">
                {equalParts.map((amount, index) => (
                  <li key={index} className="flex items-center justify-between text-ink">
                    <span>Parte {index + 1}</span>
                    <span className="tabular">{formatBRL(amount)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {guestParticipation.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Por pessoa
                </p>
                <ul className="flex flex-col gap-2">
                  {guestParticipation.map((part) => (
                    <li key={part.guestId} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-ink">{part.guestName}</span>
                          <StatusBadge tone={GUEST_STATUS_TONE[part.status]}>
                            {part.status === "SETTLED" ? "Quitada" : "Ativa"}
                          </StatusBadge>
                        </div>
                        <div className="tabular text-xs text-muted">
                          consumo {formatBRL(part.consumption)} · pago {formatBRL(part.paid)}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular font-medium text-ink">{formatBRL(part.balance)}</span>
                        <GuestSettleButton
                          tableId={id}
                          guestId={part.guestId}
                          isSettled={part.status === "SETTLED"}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Pagamentos</h2>
        {payments.length === 0 ? (
          <p className="mb-3 text-sm text-muted">Nenhum pagamento registrado ainda.</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex items-center justify-between gap-2 border-b border-line/60 pb-2 text-sm last:border-b-0 last:pb-0"
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
                {canVoidPayment && (
                  <ReasonConfirmForm
                    action={voidPaymentAction.bind(null, `/mesas/${id}`, payment.id)}
                    triggerLabel="Estornar"
                    dialogTitle="Estornar pagamento"
                    itemLabel={`Pagamento de ${formatBRL(payment.amount)} em ${payment.paymentMethod.name}`}
                    pendingLabel="Estornando..."
                    successMessage="Pagamento estornado."
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {canRegisterPaymentPermission && session.balanceAmount.greaterThan(ZERO) && (
          <RegisterPaymentForm
            redirectPath={`/mesas/${id}`}
            sessionId={session.id}
            paymentMethods={paymentMethods}
            guests={activeGuests.map((g, i) => ({ id: g.id, name: g.name ?? `Pessoa ${i + 1}` }))}
            balance={session.balanceAmount.toString()}
          />
        )}
      </Card>

      {canClosePermission && (
        <CloseTableButton
          redirectPath={`/mesas/${id}`}
          sessionId={session.id}
          itemLabel={formatSessionLabel(session, table.number)}
          disabled={!readyToClose}
          disabledReason={
            readyToClose
              ? undefined
              : session.status !== "CLOSING"
                ? "Solicite o fechamento da mesa antes de finalizar."
                : "Registre o pagamento total (saldo zerado) para finalizar."
          }
        />
      )}
    </div>
  );
}
