"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { updateUser, type FormState } from "../../actions";

const initialState: FormState = { error: null };

export function EditUserForm({
  user,
  roles,
}: {
  user: { id: string; name: string; email: string; roleId: string; active: boolean };
  roles: { id: string; label: string }[];
}) {
  const { showToast } = useToast();
  const action = updateUser.bind(null, user.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Usuário atualizado.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">E-mail</span>
        <p className="text-sm text-muted">{user.email}</p>
        <p className="text-xs text-muted">
          O e-mail é a identidade de acesso e não pode ser trocado aqui.
        </p>
      </div>
      <TextField label="Nome" name="name" defaultValue={user.name} required maxLength={120} />
      <SelectField label="Perfil" name="roleId" defaultValue={user.roleId} required>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </SelectField>
      <CheckboxField label="Ativo" name="active" defaultChecked={user.active} />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
