"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import {
  createRoastReservation,
  CreateRoastReservationError,
} from "@/application/roast/create-reservation";
import { editRoastReservation, EditRoastReservationError } from "@/application/roast/edit-reservation";
import { cancelRoastReservation, CancelRoastReservationError } from "@/application/roast/cancel-reservation";
import {
  deliverRoastReservation,
  DeliverRoastReservationError,
} from "@/application/roast/deliver-reservation";
import { createRoastReservationPrintJob } from "@/application/printing/create-roast-reservation-print-job";
import { writeAuditLog } from "@/application/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

export type FormState = { error: string | null; success?: boolean };

const itemsSchema = z.array(
  z.object({
    roastProductId: z.string(),
    quantity: z.number(),
  }),
);

function parseItemsJson(formData: FormData) {
  return itemsSchema.parse(JSON.parse(String(formData.get("itemsJson") ?? "[]")));
}

function revalidateReservas(productionDayId: string) {
  revalidatePath("/reservas-assados");
  revalidatePath(`/reservas-assados/${productionDayId}`, "page");
}

export async function createReservationAction(
  productionDayId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ROASTS_CREATE);

  let items;
  try {
    items = parseItemsJson(formData);
  } catch {
    return { error: "Itens inválidos. Atualize a página e tente de novo." };
  }
  if (items.length === 0) {
    return { error: "Adicione ao menos um item à reserva." };
  }

  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!idempotencyKey) {
    return { error: "Falha interna (sem chave de idempotência). Atualize a página." };
  }

  try {
    const reservation = await createRoastReservation({
      restaurantId: String(formData.get("restaurantId") ?? ""),
      productionDayId,
      waiterId: user.id,
      idempotencyKey,
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items,
    });
    revalidatePath("/reservas-assados");
    revalidatePath(`/reservas-assados/${reservation.id}`);
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof CreateRoastReservationError) return { error: error.message };
    console.error("[reservas-assados] falha ao criar reserva:", error);
    return { error: "Não foi possível criar a reserva. Tente novamente." };
  }
}

export async function editReservationAction(
  reservationId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ROASTS_EDIT);

  let items;
  try {
    items = parseItemsJson(formData);
  } catch {
    return { error: "Itens inválidos. Atualize a página e tente de novo." };
  }
  if (items.length === 0) {
    return { error: "Adicione ao menos um item à reserva." };
  }

  try {
    const reservation = await editRoastReservation({
      reservationId,
      editedById: user.id,
      customerName: String(formData.get("customerName") ?? ""),
      customerPhone: String(formData.get("customerPhone") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      items,
    });
    revalidateReservas(reservation.productionDayId);
    revalidatePath(`/reservas-assados/${reservation.id}`);
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof EditRoastReservationError) return { error: error.message };
    console.error("[reservas-assados] falha ao editar reserva:", error);
    return { error: "Não foi possível editar a reserva. Tente novamente." };
  }
}

export async function cancelReservationAction(
  reservationId: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ROASTS_CANCEL);

  try {
    const reservation = await cancelRoastReservation({
      reservationId,
      cancelledById: user.id,
      reason: String(formData.get("reason") ?? ""),
    });
    revalidateReservas(reservation.productionDayId);
    revalidatePath(`/reservas-assados/${reservation.id}`);
    return { error: null, success: true };
  } catch (error) {
    if (error instanceof CancelRoastReservationError) return { error: error.message };
    console.error("[reservas-assados] falha ao cancelar reserva:", error);
    return { error: "Não foi possível cancelar a reserva. Tente novamente." };
  }
}

export async function deliverReservationAction(reservationId: string) {
  const user = await requirePermission(PERMISSIONS.ROASTS_DELIVER);

  try {
    const reservation = await deliverRoastReservation({ reservationId, deliveredById: user.id });
    revalidateReservas(reservation.productionDayId);
    revalidatePath(`/reservas-assados/${reservation.id}`);
  } catch (error) {
    if (error instanceof DeliverRoastReservationError) throw error;
    throw new Error("Não foi possível marcar a reserva como entregue.");
  }
}

export async function reprintReservationAction(reservationId: string): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.ROASTS_EDIT);

  const reservation = await prisma.roastReservation.findUnique({
    where: { id: reservationId },
    select: { status: true, restaurantId: true },
  });
  if (!reservation || reservation.restaurantId !== user.restaurantId) {
    return { error: "Reserva não encontrada." };
  }
  if (reservation.status !== "PENDING") {
    return { error: "Só é possível imprimir novamente uma reserva pendente." };
  }

  try {
    await createRoastReservationPrintJob(reservationId);
  } catch (error) {
    console.error("[reservas-assados] falha ao reimprimir ticket:", error);
    return { error: "Não foi possível enviar o ticket para impressão. Tente novamente." };
  }

  await prisma.$transaction((tx) =>
    writeAuditLog(tx, {
      restaurantId: user.restaurantId,
      userId: user.id,
      tableId: null,
      action: "roast_reservation.reprinted",
      entityType: "RoastReservation",
      entityId: reservationId,
    }),
  );

  revalidatePath(`/reservas-assados/${reservationId}`);
  return { error: null, success: true };
}
