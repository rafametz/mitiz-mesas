"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckboxField, SelectField, TextAreaField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { updateProduct, type FormState } from "../../actions";

type Option = { id: string; name: string };
type ProductData = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string;
  defaultSectorId: string;
  available: boolean;
  active: boolean;
};

const initialState: FormState = { error: null };

export function EditProductForm({
  product,
  categories,
  sectors,
}: {
  product: ProductData;
  categories: Option[];
  sectors: Option[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = updateProduct.bind(null, product.id);
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Mesmo padrão de novo-produto/mesas — a ação não redireciona no
  // servidor, o componente cliente confirma e volta pra listagem assim que
  // vê `success: true` (docs/performance/optimization-plan.md, Fase 4).
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Produto atualizado.");
      router.push("/admin/produtos");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <TextField label="Nome" name="name" defaultValue={product.name} required maxLength={120} />
      <TextAreaField
        label="Descrição (opcional)"
        name="description"
        defaultValue={product.description ?? ""}
        maxLength={500}
      />
      <TextField
        label="Preço (R$)"
        name="price"
        inputMode="decimal"
        defaultValue={product.price}
        required
      />
      <SelectField label="Categoria" name="categoryId" defaultValue={product.categoryId} required>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Setor de destino"
        name="defaultSectorId"
        defaultValue={product.defaultSectorId}
        required
      >
        {sectors.map((sector) => (
          <option key={sector.id} value={sector.id}>
            {sector.name}
          </option>
        ))}
      </SelectField>
      <CheckboxField label="Disponível" name="available" defaultChecked={product.available} />
      <CheckboxField label="Ativo" name="active" defaultChecked={product.active} />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
