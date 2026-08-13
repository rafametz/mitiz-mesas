"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { createUser, type FormState } from "../actions";

const initialState: FormState = { error: null };

export function NewUserForm({ roles }: { roles: { id: string; label: string }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(createUser, initialState);

  // Mesmo padrão de NewProductForm/NewGroupForm: a ação não redireciona no
  // servidor, o componente cliente confirma e volta pra listagem assim que
  // vê `success: true`.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Usuário criado.");
      router.push("/admin/usuarios");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField label="Nome" name="name" required maxLength={120} />
      <TextField label="E-mail" name="email" type="email" required maxLength={255} />
      <TextField
        label="Senha temporária"
        name="password"
        type="password"
        required
        minLength={8}
        hint="Pelo menos 8 caracteres. Combine com a pessoa antes de entregar o acesso."
      />
      <SelectField label="Perfil" name="roleId" required defaultValue="">
        <option value="" disabled>
          Selecione
        </option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.label}
          </option>
        ))}
      </SelectField>
      <CheckboxField label="Ativo" name="active" defaultChecked />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Criando...">Criar usuário</SubmitButton>
    </form>
  );
}
