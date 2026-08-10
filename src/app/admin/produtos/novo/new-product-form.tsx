"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { MoneyField } from "@/components/form/money-field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { createProduct, type FormState } from "../actions";

type Option = { id: string; name: string };

const initialState: FormState = { error: null };

export function NewProductForm({
  categories,
  sectors,
}: {
  categories: Option[];
  sectors: Option[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(createProduct, initialState);

  // Mesmo padrão de mesas/[id]/pedidos/novo/new-order-form.tsx: a ação não
  // redireciona no servidor, então `wasPending` distingue "acabou de salvar
  // com sucesso" do estado inicial (que também tem success falsy).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Produto criado.");
      router.push("/admin/produtos");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <TextField label="Nome" name="name" required maxLength={120} />
      <TextAreaField label="Descrição (opcional)" name="description" maxLength={500} />
      <MoneyField label="Preço" name="price" />
      <SelectField label="Categoria" name="categoryId" required defaultValue="">
        <option value="" disabled>
          Selecione
        </option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Setor de destino" name="defaultSectorId" required defaultValue="">
        <option value="" disabled>
          Selecione
        </option>
        {sectors.map((sector) => (
          <option key={sector.id} value={sector.id}>
            {sector.name}
          </option>
        ))}
      </SelectField>
      <CheckboxField label="Disponível" name="available" defaultChecked />
      <CheckboxField label="Ativo" name="active" defaultChecked />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Criando...">Criar produto</SubmitButton>
    </form>
  );
}
