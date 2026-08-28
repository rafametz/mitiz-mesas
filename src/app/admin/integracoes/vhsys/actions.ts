"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { InvalidVhsysProductIdError, parseVhsysProductId } from "@/domain/product/vhsys-link";

export type FormState = { error: string | null };

// Vincula (ou desvincula, se o campo vier vazio) um produto do MITIZ ao
// id_produto correspondente na VHSYS — sempre manual, nunca resolvido por
// nome (decisão do usuário, análise de 2026-08-25). Mesma permissão das
// outras telas de cadastro admin (ADMIN_MANAGE), sem permissão nova.
export async function linkProductToVhsysAction(
  productId: string,
  _prevState: FormState, // eslint-disable-line @typescript-eslint/no-unused-vars
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);

  let vhsysProductId: number | null;
  try {
    vhsysProductId = parseVhsysProductId(String(formData.get("vhsysProductId") ?? ""));
  } catch (error) {
    if (error instanceof InvalidVhsysProductIdError) return { error: error.message };
    return { error: "Não foi possível salvar o vínculo. Tente de novo." };
  }

  await prisma.product.update({ where: { id: productId }, data: { vhsysProductId } });

  revalidatePath("/admin/integracoes/vhsys");
  return { error: null };
}

// Vincula direto a partir de um resultado já encontrado na busca por nome
// (painel "Buscar vínculo" de cada linha, pedido do usuário 2026-08-29) —
// o id_produto vem da própria resposta da VHSYS, não de digitação, então
// não precisa passar por parseVhsysProductId/formulário com estado de
// erro. `vhsysProductId` e `productId` já vêm presos via `.bind`, por
// isso o formulário não precisa de nenhum campo escondido.
export async function quickLinkProductAction(productId: string, vhsysProductId: number) {
  await requirePermission(PERMISSIONS.ADMIN_MANAGE);
  await prisma.product.update({ where: { id: productId }, data: { vhsysProductId } });
  revalidatePath("/admin/integracoes/vhsys");
}
