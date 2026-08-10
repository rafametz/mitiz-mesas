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
import { splitByPerson, splitEqually, type SplitItemInput } from "@/domain/service-session/split";
import { DISCOUNT_TYPE_LABELS } from "@/domain/service-session/labels";
import { Card } from "@/components/ui/card";
import { SummaryField } from "@/components/ui/summary-field";
import { ReasonConfirmForm } from "@/components/form/reason-confirm-form";
import { formatDateTime } from "@/lib/datetime";
import { formatBRL, sumDecimals, toDecimal, ZERO } from "@/lib/money";
import { voidDiscountAction, voidPaymentAction } from "./actions";
import { ApplyDiscountForm } from "./apply-discount-form";
import { CloseTableButton } from "./close-table-button";
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

  const canRequestClosingPermission = hasAnyPermission(user.permissions, [
    PERMISSIONS.TABLES_CLOSE_REQUEST,
    PERMISSIONS.TABLES_CLOSE,
  ]);

  // Antes do fechamento solicitado, não há taxa/desconto/pagamento pra
  // mostrar — só o convite pra dar o primeiro passo (business-rules.md §6).
  if (session.status === "OPEN") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <h2 className="font-display text-lg font-semibold text-ink">Fechamento e pagamentos</h2>
        {canRequestClosingPermission ? (
          <>
            <p className="max-w-xs text-sm text-muted">
              Esta mesa ainda está com o atendimento em andamento. Solicite o fechamento para
              revisar taxa de serviço, aplicar desconto e registrar o pagamento.
            </p>
            <RequestClosingButton tableId={id} sessionId={session.id} tableNumber={table.number} />
          </>
        ) : (
          <p className="max-w-xs text-sm text-muted">
            Esta mesa ainda está com o atendimento em andamento. Peça para o garçom ou o caixa
            solicitar o fechamento.
          </p>
        )}
      </div>
    );
  }

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
      include: { paymentMethod: true, registeredBy: true },
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

  // Divisão da conta: ferramenta de apoio pro caixa (business-rules.md §6,
  // passo 5) — só ajuda a calcular, não grava nada; a divisão de verdade
  // acontece pelos pagamentos que forem registrados abaixo.
  const parts = Math.min(50, Math.max(1, Number(sp.partes) || session.guestCount || 2));
  const hasBalanceToSplit = toDecimal(session.totalAmount).greaterThan(ZERO);
  const equalParts = hasBalanceToSplit ? splitEqually(session.totalAmount, parts) : [];

  const guestsForSplit = session.guests.map((guest, index) => ({
    id: guest.id,
    name: guest.name ?? `Pessoa ${index + 1}`,
  }));
  const splitItems: SplitItemInput[] = items.map((item) => {
    const modifiersTotal = sumDecimals(
      item.modifiers.map((m) => toDecimal(m.priceDeltaAtOrder).mul(m.quantity)),
    );
    const lineTotal = toDecimal(item.unitPrice).add(modifiersTotal).mul(item.quantity);
    return { guestId: item.guestId, label: `${item.quantity}x ${item.productNameAtOrder}`, lineTotal };
  });
  const personSplit =
    hasBalanceToSplit && guestsForSplit.length > 0 ? splitByPerson(splitItems, guestsForSplit) : [];

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

      {canApplyServiceCharge && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-ink">Taxa de serviço</h2>
          <p className="mb-3 text-xs text-muted">
            {latestServiceCharge
              ? latestServiceCharge.waived
                ? `Retirada por ${latestServiceCharge.appliedBy.name} — ${latestServiceCharge.waivedReason}`
                : `Vigente: ${latestServiceCharge.percent.toString()}% (${formatBRL(latestServiceCharge.amountApplied)}), aplicada por ${latestServiceCharge.appliedBy.name}`
              : "Nenhuma taxa aplicada ainda — opcional (CLAUDE.md regra 15)."}
          </p>
          <ServiceChargeForm
            tableId={id}
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
                {activeDiscount.reason} — {activeDiscount.appliedBy.name}
              </p>
              <ReasonConfirmForm
                action={voidDiscountAction.bind(null, id, activeDiscount.id)}
                triggerLabel="Anular desconto"
                dialogTitle="Anular desconto"
                itemLabel={`Desconto de ${formatBRL(activeDiscount.amountApplied)}`}
                pendingLabel="Anulando..."
                successMessage="Desconto anulado."
              />
            </div>
          ) : (
            <ApplyDiscountForm tableId={id} sessionId={session.id} />
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

            {personSplit.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Por pessoa
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {personSplit.map((part) => (
                    <li key={part.guestId} className="flex items-center justify-between text-ink">
                      <span>{part.guestName}</span>
                      <span className="tabular">{formatBRL(part.amount)}</span>
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
                    {payment.paymentMethod.name} —{" "}
                    <span className="tabular font-medium">{formatBRL(payment.amount)}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTime(payment.createdAt)} · {payment.registeredBy.name}
                  </div>
                </div>
                {canVoidPayment && (
                  <ReasonConfirmForm
                    action={voidPaymentAction.bind(null, id, payment.id)}
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
            tableId={id}
            sessionId={session.id}
            paymentMethods={paymentMethods}
            balance={session.balanceAmount.toString()}
          />
        )}
      </Card>

      {canClosePermission && (
        <CloseTableButton
          tableId={id}
          sessionId={session.id}
          tableNumber={table.number}
          disabled={!readyToClose}
          disabledReason={
            readyToClose ? undefined : "Registre o pagamento total (saldo zerado) para finalizar."
          }
        />
      )}
    </div>
  );
}
