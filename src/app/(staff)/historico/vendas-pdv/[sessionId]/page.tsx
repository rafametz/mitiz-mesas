import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReasonConfirmForm } from "@/components/form/reason-confirm-form";
import { formatBRL, sumDecimals, toDecimal } from "@/lib/money";
import { formatDateTime } from "@/lib/datetime";
import { reverseSaleAction } from "../actions";

function formatWeight(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

// Detalhe de uma venda do PDV (pedido do usuário, 2026-11-08: "entrar nele
// e ver os valores, o que foi feito esse PDV, e que tem uma possibilidade
// também de estornar"). `totalAmount` zerado é o sinal de venda já
// estornada (ver page.tsx da listagem) — "Total original" aqui sempre
// soma TODOS os itens, cancelados ou não (regra 7 — item cancelado nunca
// é apagado), pra continuar mostrando o que a venda valia antes do
// estorno em vez de sumir com a informação.
export default async function VendaPdvDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const { sessionId } = await params;

  const session = await prisma.serviceSession.findUnique({
    where: { id: sessionId },
    include: {
      waiter: true,
      orders: { include: { items: true } },
      payments: { include: { paymentMethod: true, voidedBy: true } },
    },
  });
  if (!session || session.type !== "PDV") notFound();

  const items = session.orders.flatMap((order) => order.items);
  const reversed = session.totalAmount.isZero();
  const originalTotal = sumDecimals(items.map((item) => toDecimal(item.unitPrice).mul(item.quantity)));
  const canReverse = hasPermission(user.permissions, PERMISSIONS.PAYMENTS_REGISTER);

  const reversalLog = reversed
    ? await prisma.auditLog.findFirst({
        where: { entityType: "ServiceSession", entityId: session.id, action: "pdv_sale.reversed" },
        include: { user: true },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const reversalMetadata = reversalLog?.metadata as Record<string, unknown> | null;
  const reversalReason =
    reversalMetadata && typeof reversalMetadata.reason === "string" ? reversalMetadata.reason : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pt-6">
      <Link
        href="/historico/vendas-pdv"
        className="flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> Vendas do PDV
      </Link>

      <PageHeader
        title={formatDateTime(session.openedAt)}
        subtitle={`Vendedor: ${session.waiter.name}`}
        action={
          <StatusBadge tone={reversed ? "wine" : "free"}>
            {reversed ? "Estornada" : "Concluída"}
          </StatusBadge>
        }
      />

      {reversed && reversalLog && (
        <Card padding="sm" className="border-wine/30 bg-wine/5">
          <p className="text-sm font-medium text-ink">
            Estornada por {reversalLog.user?.name ?? "Sistema"}
          </p>
          <p className="text-xs text-muted">{formatDateTime(reversalLog.createdAt)}</p>
          {reversalReason && <p className="mt-1 text-sm text-ink">Motivo: {reversalReason}</p>}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Itens</h2>
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const lineTotal = toDecimal(item.unitPrice).mul(item.quantity);
            const cancelled = item.status === "CANCELLED";
            return (
              <li
                key={item.id}
                className={`flex items-center justify-between gap-2 text-sm ${
                  cancelled ? "text-muted line-through" : "text-ink"
                }`}
              >
                <span>
                  {item.weightQuantity ? `${formatWeight(item.weightQuantity)} kg ` : `${item.quantity}x `}
                  {item.productNameAtOrder}
                  {cancelled && <span className="ml-1 text-xs text-wine no-underline">(cancelado)</span>}
                </span>
                <span className="tabular shrink-0">{formatBRL(lineTotal)}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line pt-2 text-sm font-semibold text-ink">
          <span>Total original</span>
          <span className="tabular">{formatBRL(originalTotal)}</span>
        </div>
        {reversed && (
          <div className="flex items-baseline justify-between text-sm font-semibold text-wine">
            <span>Total após estorno</span>
            <span className="tabular">{formatBRL(session.totalAmount)}</span>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Pagamentos</h2>
        <ul className="flex flex-col gap-2">
          {session.payments.map((payment) => (
            <li key={payment.id} className="flex flex-col gap-0.5 text-sm">
              <div
                className={`flex items-center justify-between gap-2 ${
                  payment.voidedAt ? "text-muted line-through" : "text-ink"
                }`}
              >
                <span>{payment.paymentMethod.name}</span>
                <span className="tabular">{formatBRL(payment.amount)}</span>
              </div>
              {payment.voidedAt && (
                <p className="text-xs text-wine no-underline">
                  Estornado{payment.voidedBy ? ` por ${payment.voidedBy.name}` : ""} em{" "}
                  {formatDateTime(payment.voidedAt)}
                  {payment.voidReason ? `. Motivo: ${payment.voidReason}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {!reversed && canReverse && (
        <ReasonConfirmForm
          action={reverseSaleAction.bind(null, session.id)}
          triggerLabel="Estornar venda"
          dialogTitle="Estornar esta venda?"
          itemLabel={`Venda de ${formatBRL(originalTotal)}, cancela os itens e estorna o(s) pagamento(s)`}
          pendingLabel="Estornando..."
          successMessage="Venda estornada."
          triggerClassName="inline-flex h-11 items-center justify-center rounded-control-sm bg-wine px-4 text-sm font-semibold text-bg hover:bg-wine-dark"
        />
      )}
    </main>
  );
}
