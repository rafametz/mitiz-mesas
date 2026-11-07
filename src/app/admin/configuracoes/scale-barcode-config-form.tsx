"use client";

import { useActionState, useEffect, useRef } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/form/field";
import { SubmitButton } from "@/components/form/submit-button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { saveScaleBarcodeConfigAction, type FormState } from "./actions";
import type { ScaleBarcodeConfigInput } from "@/domain/pdv/scale-barcode-config";

const initialState: FormState = { error: null };

// Mesmo layout do leitor de código de barras de balança que o usuário já
// usa hoje em outro programa (pedido explícito, 2026-11-07) — campos e
// numeração espelham a referência dele de propósito, em vez de uma forma
// "mais moderna" de pedir a mesma informação, pra reduzir a chance de erro
// de quem está acostumado com a tela antiga. Primeira etapa do PDV por
// quilo: só a configuração; a leitura do código em si no PDV vem depois.
export function ScaleBarcodeConfigForm({
  initialValues,
}: {
  initialValues: ScaleBarcodeConfigInput;
}) {
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(saveScaleBarcodeConfigAction, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && state.success) {
      showToast("Configuração da balança salva.");
    }
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state.success]);

  return (
    <Card className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Balança do Caixa</h2>
        <p className="mt-1 text-sm text-muted">
          Configuração do código de barras gerado pela balança, para o PDV identificar
          automaticamente o produto e o peso ou o valor ao ler o código.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <CheckboxField
          label="Ler código de barras gerado por balança"
          name="enabled"
          defaultChecked={initialValues.enabled}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="1. Número inicial para identificar o código de barras gerado pela balança"
            name="prefixDigit"
            type="number"
            inputMode="numeric"
            min={0}
            max={9}
            defaultValue={initialValues.prefixDigit}
            required
          />
          <TextField
            label="2. Tamanho total do código de barras gerado pela balança"
            name="totalLength"
            type="number"
            inputMode="numeric"
            min={6}
            max={30}
            defaultValue={initialValues.totalLength}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">3. Como identificar o código do produto</p>
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Inicia no dígito"
              name="productCodeStart"
              type="number"
              inputMode="numeric"
              min={2}
              className="w-28"
              defaultValue={initialValues.productCodeStart}
              required
            />
            <TextField
              label="E vai até o dígito"
              name="productCodeEnd"
              type="number"
              inputMode="numeric"
              min={2}
              className="w-28"
              defaultValue={initialValues.productCodeEnd}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">
            4. Como identificar o peso ou o valor do produto
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              label="Inicia no dígito"
              name="valueStart"
              type="number"
              inputMode="numeric"
              min={2}
              className="w-28"
              defaultValue={initialValues.valueStart}
              required
            />
            <TextField
              label="E vai até o dígito"
              name="valueEnd"
              type="number"
              inputMode="numeric"
              min={2}
              className="w-28"
              defaultValue={initialValues.valueEnd}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">
            5. O código de barras contém o peso ou o valor do produto?
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label="Contém"
              name="valueType"
              className="w-32"
              defaultValue={initialValues.valueType}
              required
            >
              <option value="WEIGHT">Peso</option>
              <option value="PRICE">Valor</option>
            </SelectField>
            <SelectField
              label="Com quantas casas decimais"
              name="decimalPlaces"
              className="w-24"
              defaultValue={initialValues.decimalPlaces}
              required
            >
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </SelectField>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-wine">
            {state.error}
          </p>
        )}

        <SubmitButton pendingLabel="Salvando..." className="self-start">
          Salvar configurações
        </SubmitButton>
      </form>
    </Card>
  );
}
