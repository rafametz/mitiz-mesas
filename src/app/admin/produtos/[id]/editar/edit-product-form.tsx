"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { ProductFormFields, type ProductFormDefaults } from "../../product-form-fields";
import { updateProduct, type FormState } from "../../actions";

type Option = { id: string; name: string };

const initialState: FormState = { error: null };

export function EditProductForm({
  productId,
  defaults,
  categories,
  sectors,
}: {
  productId: string;
  defaults: ProductFormDefaults;
  categories: Option[];
  sectors: Option[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const action = updateProduct.bind(null, productId);
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
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <ProductFormFields defaults={defaults} categories={categories} sectors={sectors} />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Salvando...">Salvar</SubmitButton>
    </form>
  );
}
