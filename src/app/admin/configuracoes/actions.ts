"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { PERMISSIONS } from "@/domain/auth/permissions";
import {
  saveScaleBarcodeConfig,
  ScaleBarcodeConfigValidationError,
} from "@/application/pdv/scale-barcode-config";

export type FormState = { error: string | null; success?: boolean };

const formSchema = z.object({
  enabled: z.boolean(),
  prefixDigit: z.coerce.number().int(),
  totalLength: z.coerce.number().int(),
  productCodeStart: z.coerce.number().int(),
  productCodeEnd: z.coerce.number().int(),
  valueStart: z.coerce.number().int(),
  valueEnd: z.coerce.number().int(),
  valueType: z.enum(["WEIGHT", "PRICE"]),
  decimalPlaces: z.coerce.number().int(),
});

// Configuração de leitura de código de barras gerado por balança (PDV por
// quilo, pedido do usuário 2026-11-07) — a validação de negócio de verdade
// (faixas de dígitos, casas decimais) mora em saveScaleBarcodeConfig/
// validateScaleBarcodeConfig; o schema aqui só garante que os campos
// chegaram como número inteiro antes de passar adiante.
export async function saveScaleBarcodeConfigAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  const restaurant = await getCurrentRestaurant();

  let data: z.infer<typeof formSchema>;
  try {
    data = formSchema.parse({
      enabled: formData.get("enabled") === "on",
      prefixDigit: formData.get("prefixDigit"),
      totalLength: formData.get("totalLength"),
      productCodeStart: formData.get("productCodeStart"),
      productCodeEnd: formData.get("productCodeEnd"),
      valueStart: formData.get("valueStart"),
      valueEnd: formData.get("valueEnd"),
      valueType: formData.get("valueType"),
      decimalPlaces: formData.get("decimalPlaces"),
    });
  } catch {
    return { error: "Preencha todos os campos com números válidos." };
  }

  try {
    await saveScaleBarcodeConfig(restaurant.id, user.id, data);
  } catch (error) {
    if (error instanceof ScaleBarcodeConfigValidationError) return { error: error.message };
    console.error("[admin/configuracoes] falha ao salvar configuração da balança:", error);
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  revalidatePath("/admin/configuracoes");
  return { error: null, success: true };
}
