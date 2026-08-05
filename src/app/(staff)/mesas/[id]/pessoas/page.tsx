import { redirect } from "next/navigation";
import { requireUser } from "@/application/auth/get-current-user";
import { getTableWithActiveSession } from "@/application/service-session/get-table-with-session";
import { hasPermission, PERMISSIONS } from "@/domain/auth/permissions";
import { TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { addGuest } from "../actions";

export default async function PessoasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { session } = await getTableWithActiveSession(id);
  if (!session) redirect(`/mesas/${id}`);

  const canAdd = hasPermission(user.permissions, PERMISSIONS.TABLES_OPEN);
  const addGuestWithIds = addGuest.bind(null, session.id, id);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Responsável</h2>
        <p className="text-sm text-muted">{session.responsibleName ?? "Não informado"}</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">
          Pessoas ({session.guests.length}/{session.guestCount})
        </h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {session.guests.map((guest) => (
            <li key={guest.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              {guest.name}
            </li>
          ))}
          {session.guests.length === 0 && (
            <li className="text-muted">Nenhum nome informado ainda.</li>
          )}
        </ul>
      </div>

      {canAdd && (
        <form action={addGuestWithIds} className="flex max-w-xs items-end gap-3">
          <TextField label="Adicionar pessoa" name="name" required maxLength={80} />
          <SubmitButton>Adicionar</SubmitButton>
        </form>
      )}
    </div>
  );
}
