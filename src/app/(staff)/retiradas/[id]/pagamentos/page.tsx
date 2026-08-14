import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getPickupSession } from "@/application/service-session/get-pickup-with-session";
import { hasAnyPermission, hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import {
  canCloseTable,
  canModifyClosingCharges,
  canRegisterPayment,
} from "@/domain/service-session/closing";
import { DISCOUNT_TYPE_LABELS, formatSessionLabel } from "@/domain/service-session/labels";
import { Card } from "@/components/ui/card";
import { SummaryField } from "@/components/ui/summary-field";
import { ReasonConfirmForm } from "@/components/form/reason-confirm-form";
import { formatDateTime } from "@/lib/datetime";
import { formatBRL, ZERO } from "@/lib/money";
import { voidDiscountAction, voidPaymentAction } from "../../../mesas/[id]/pagamentos/actions";
import { ApplyDiscountForm } from "../../../mesas/[id]/pagamentos/apply-discount-form";
import { CancelClosingRequestButton } from "../../../mesas/[id]/pagamentos/cancel-closing-request-button";
import { CloseTableButton } from "../../../mesas/[id]/pagamentos/close-table-button";
import { RegisterPaymentForm } from "../../../mesas/[id]/pagamentos/register-payment-form";
import { RequestClosingButton } from "../../../mesas/[id]/pagamentos/request-closing-button";
import { ServiceChargeForm } from "../../../mesas/[id]/pagamentos/service-charge-form";

// Mesmos formulários/ações de pagamento das mesas (mesas/[id]/pagamentos) —
// reaproveitados via redirectPath, sem duplicar a lógica financeira.
// Diferente da versão de mesa: sem "Pessoas"/divisão por pessoa (retirada
// é sempre um único cliente, não um grupo à mesa). Módulo Retiradas,
// 2026-08-14.
export default async function PagamentosRetiradaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const session = await getPickupSession(id);
  const redirectPath = `/retiradas/${id}`;

  const restaurant = await getCurrentRestaurant();

  const [activeDiscount, latestServiceCharge, payments, paymentMethods] = await Promise.all([
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
  const itemLabel = formatSessionLabel(session);

  return (
    <div className="flex flex-col gap-4 pb-8">
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

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Fechamento</h2>
        {session.status === "CLOSING" ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-ink">
              Fechamento solicitado. Revise taxa de serviço, desconto e registre o pagamento antes
              de finalizar.
            </p>
            {canRequestClosingPermission && (
              <CancelClosingRequestButton redirectPath={redirectPath} sessionId={session.id} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Atendimento aberto. Pedidos continuam sendo aceitos normalmente. Solicite o
              fechamento quando a retirada estiver pronta para encerrar.
            </p>
            {canRequestClosingPermission ? (
              <RequestClosingButton
                redirectPath={redirectPath}
                sessionId={session.id}
                itemLabel={itemLabel}
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
            redirectPath={redirectPath}
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
                action={voidDiscountAction.bind(null, redirectPath, activeDiscount.id)}
                triggerLabel="Anular desconto"
                dialogTitle="Anular desconto"
                itemLabel={`Desconto de ${formatBRL(activeDiscount.amountApplied)}`}
                pendingLabel="Anulando..."
                successMessage="Desconto anulado."
              />
            </div>
          ) : (
            <ApplyDiscountForm redirectPath={redirectPath} sessionId={session.id} />
          )}
        </Card>
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
                  </div>
                  <div className="text-xs text-muted">
                    {formatDateTime(payment.createdAt)} · {payment.registeredBy.name}
                  </div>
                </div>
                {canVoidPayment && (
                  <ReasonConfirmForm
                    action={voidPaymentAction.bind(null, redirectPath, payment.id)}
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
            redirectPath={redirectPath}
            sessionId={session.id}
            paymentMethods={paymentMethods}
            guests={[]}
            balance={session.balanceAmount.toString()}
          />
        )}
      </Card>

      {canClosePermission && (
        <CloseTableButton
          redirectPath={redirectPath}
          sessionId={session.id}
          itemLabel={itemLabel}
          disabled={!readyToClose}
          disabledReason={
            readyToClose
              ? undefined
              : session.status !== "CLOSING"
                ? "Solicite o fechamento antes de finalizar."
                : "Registre o pagamento total (saldo zerado) para finalizar."
          }
        />
      )}
    </div>
  );
}
