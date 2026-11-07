import { PageHeader } from "@/components/ui/card";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { getScaleBarcodeConfig } from "@/application/pdv/scale-barcode-config";
import type { ScaleBarcodeConfigInput } from "@/domain/pdv/scale-barcode-config";
import { ScaleBarcodeConfigForm } from "./scale-barcode-config-form";

// Valores iniciais sugeridos quando ainda não existe configuração salva —
// mesmo layout de código que o usuário já usa hoje em outro programa
// (pedido 2026-11-07), só pra não abrir a tela com os campos vazios na
// primeira vez; o admin confirma ou ajusta e salva.
const DEFAULT_CONFIG: ScaleBarcodeConfigInput = {
  enabled: true,
  prefixDigit: 2,
  totalLength: 13,
  productCodeStart: 2,
  productCodeEnd: 5,
  valueStart: 9,
  valueEnd: 12,
  valueType: "WEIGHT",
  decimalPlaces: 3,
};

export default async function ConfiguracoesPage() {
  const restaurant = await getCurrentRestaurant();
  const config = await getScaleBarcodeConfig(restaurant.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" subtitle="Ajustes gerais de operação do PDV." />
      <ScaleBarcodeConfigForm initialValues={config ?? DEFAULT_CONFIG} />
    </div>
  );
}
