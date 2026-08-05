import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { formatBRL } from "@/lib/money";
import { OpenTableForm } from "./open-table-form";

function SummaryField({
  label,
  value,
  testId,
  emphasis = false,
}: {
  label: string;
  value: string;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-card border p-3 ${
        emphasis ? "border-wine/25 bg-wine/[0.04]" : "border-line bg-surface"
      }`}
    >
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`tabular font-display text-lg font-semibold ${emphasis ? "text-wine" : "text-ink"}`}
        data-testid={testId}
      >
        {value}
      </div>
    </div>
  );
}

export default async function MesaComandaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { table, session } = await getTableWithActiveSession(id);

  if (!session) {
    if (!hasPermission(user.permissions, PERMISSIONS.TABLES_OPEN)) {
      return <p className="text-sm text-muted">Mesa livre. Seu perfil não abre mesas.</p>;
    }

    const restaurant = await getCurrentRestaurant();
    const waiters = await prisma.user.findMany({
      where: {
        restaurantId: restaurant.id,
        active: true,
        role: { name: { in: ["WAITER", "ADMIN"] } },
      },
      orderBy: { name: "asc" },
    });

    return (
      <OpenTableForm
        tableId={table.id}
        waiters={waiters.map((w) => ({ id: w.id, name: w.name }))}
        currentUserId={user.id}
      />
    );
  }

  const orderCount = await prisma.order.count({ where: { serviceSessionId: session.id } });

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryField
          label="Subtotal"
          value={formatBRL(session.subtotalAmount)}
          testId="resumo-subtotal"
        />
        <SummaryField
          label="Taxa de serviço"
          value={formatBRL(session.serviceChargeAmount)}
          testId="resumo-taxa"
        />
        <SummaryField
          label="Desconto"
          value={formatBRL(session.discountAmount)}
          testId="resumo-desconto"
        />
        <SummaryField label="Total" value={formatBRL(session.totalAmount)} testId="resumo-total" />
        <SummaryField label="Pago" value={formatBRL(session.paidAmount)} testId="resumo-pago" />
        <SummaryField
          label="Saldo"
          value={formatBRL(session.balanceAmount)}
          testId="resumo-saldo"
          emphasis
        />
      </div>
      <p className="text-sm text-muted">
        Taxa, desconto e pagamentos ainda não são aplicáveis por aqui — chegam no Módulo 8.
      </p>
      <Link
        href={`/mesas/${id}/pedidos`}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-wine"
      >
        {orderCount === 0 ? "Lançar primeiro pedido" : `Ver pedidos (${orderCount})`}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
