import { redirect } from "next/navigation";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";

export default async function PagamentosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);

  return (
    <p className="py-4 text-sm text-muted">
      Divisão de conta e registro de pagamentos chegam no Módulo 8 do backlog.
    </p>
  );
}
