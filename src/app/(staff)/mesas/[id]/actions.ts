"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/application/auth/get-current-user";
import { openTable, OpenTableError } from "@/application/service-session/open-table";
import { PERMISSIONS } from "@/domain/auth/permissions";

export type FormState = { error: string | null };

export async function openTableAction(
  tableId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.TABLES_OPEN);

  const guestNames = formData
    .getAll("guestName")
    .map((v) => String(v).trim())
    .filter(Boolean);

  try {
    await openTable({
      tableId,
      waiterId: String(formData.get("waiterId") ?? ""),
      guestCount: String(formData.get("guestCount") ?? ""),
      responsibleName: String(formData.get("responsibleName") ?? ""),
      guestNames,
    });
  } catch (error) {
    if (error instanceof OpenTableError) {
      return { error: error.message };
    }
    return { error: "Não foi possível abrir a mesa. Tente de novo." };
  }

  revalidatePath("/mesas");
  redirect(`/mesas/${tableId}`);
}

const guestNameSchema = z.string().trim().min(1, "Informe um nome").max(80);

// Mesma permissão de abrir mesa (TABLES_OPEN) — CLAUDE.md não separa
// "adicionar pessoa" como capacidade própria na tabela de perfis, então não
// inventamos um código de permissão só para isso.
export async function addGuest(sessionId: string, tableId: string, formData: FormData) {
  await requirePermission(PERMISSIONS.TABLES_OPEN);
  const name = guestNameSchema.parse(formData.get("name"));

  const lastGuest = await prisma.guest.findFirst({
    where: { serviceSessionId: sessionId },
    orderBy: { sortOrder: "desc" },
  });

  await prisma.guest.create({
    data: { serviceSessionId: sessionId, name, sortOrder: (lastGuest?.sortOrder ?? -1) + 1 },
  });

  // Pessoas vive na tela principal da mesa desde a refatoração
  // mobile-first (não existe mais uma página "/pessoas" própria).
  revalidatePath(`/mesas/${tableId}`);
}
