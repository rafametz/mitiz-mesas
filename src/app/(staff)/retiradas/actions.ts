"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PickupOrigin } from "@prisma/client";
import { requirePermission } from "@/application/auth/get-current-user";
import { getCurrentRestaurant } from "@/application/restaurant/get-current-restaurant";
import { createPickup } from "@/application/service-session/create-pickup";
import { PERMISSIONS } from "@/domain/auth/permissions";

export type FormState = { error: string | null };

function firstZodMessage(error: unknown): string | null {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? null;
  return null;
}

// Reaproveita TABLES_OPEN (hipótese reversível confirmada com o usuário
// 2026-08-14): mesmo grupo que hoje abre mesa (Garçom/Admin) também abre
// retirada, sem criar um código de permissão só para isso — mesmo
// racional já usado em addGuest (mesas/[id]/actions.ts).
export async function createPickupAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  await requirePermission(PERMISSIONS.TABLES_OPEN);
  const restaurant = await getCurrentRestaurant();

  let session;
  try {
    session = await createPickup({
      restaurantId: restaurant.id,
      waiterId: String(formData.get("waiterId") ?? ""),
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      pickupOrigin: (String(formData.get("pickupOrigin") ?? "") || undefined) as
        | PickupOrigin
        | undefined,
      requestedTime: String(formData.get("requestedTime") ?? ""),
      pickupNote: String(formData.get("pickupNote") ?? ""),
    });
  } catch (error) {
    const zodMessage = firstZodMessage(error);
    if (zodMessage) return { error: zodMessage };
    return { error: "Não foi possível criar a retirada. Tente de novo." };
  }

  revalidatePath("/retiradas");
  redirect(`/retiradas/${session.id}`);
}
