"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/form/submit-button";
import { useToast } from "@/components/ui/toast";
import { EMPTY_PRODUCT_DEFAULTS, ProductFormFields } from "../product-form-fields";
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
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <ProductFormFields defaults={EMPTY_PRODUCT_DEFAULTS} categories={categories} sectors={sectors} />
      {state.error && (
        <p role="alert" className="text-sm text-wine">
          {state.error}
        </p>
      )}
      <SubmitButton pendingLabel="Criando...">Criar produto</SubmitButton>
    </form>
  );
}
