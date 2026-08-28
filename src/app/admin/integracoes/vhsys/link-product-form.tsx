"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/form/submit-button";
import { linkProductToVhsysAction, type FormState } from "./actions";

const initialState: FormState = { error: null };

// Uma linha = um produto MITIZ. Campo numérico solto (não um seletor com
// busca embutida) de propósito: o admin já viu o id_produto no painel de
// busca da VHSYS acima e só cola o número aqui — mantém a tela simples
// nesta primeira versão (CLAUDE.md §17: menor solução completa).
export function LinkProductForm({
  productId,
  currentVhsysProductId,
}: {
  productId: string;
  currentVhsysProductId: number | null;
}) {
  const action = linkProductToVhsysAction.bind(null, productId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        type="text"
        inputMode="numeric"
        name="vhsysProductId"
        defaultValue={currentVhsysProductId ?? ""}
        placeholder="id_produto"
        aria-label="ID do produto na VHSYS"
        className="w-28 rounded-control-sm border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-wine focus:outline-none focus:ring-1 focus:ring-wine"
      />
      <SubmitButton variant="secondary" pendingLabel="Salvando...">
        {currentVhsysProductId ? "Atualizar" : "Vincular"}
      </SubmitButton>
      {state.error && (
        <span role="alert" className="text-xs text-wine">
          {state.error}
        </span>
      )}
    </form>
  );
}
