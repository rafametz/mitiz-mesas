"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/application/auth/get-current-user";
import { PERMISSIONS } from "@/domain/auth/permissions";
import { createReprintJob, reprocessPrintJob, PrintJobError } from "@/application/printing/print-queue";

export type FormState = { error: string | null };

export async function reprocessAction(jobId: string): Promise<FormState> {
  await requirePermission(PERMISSIONS.PRINT_JOBS_MANAGE);
  try {
    await reprocessPrintJob(jobId);
  } catch (error) {
    if (error instanceof PrintJobError) return { error: error.message };
    return { error: "Não foi possível reprocessar." };
  }
  revalidatePath("/impressao");
  return { error: null };
}

export async function reprintAction(jobId: string): Promise<FormState> {
  await requirePermission(PERMISSIONS.PRINT_JOBS_MANAGE);
  try {
    await createReprintJob(jobId);
  } catch (error) {
    if (error instanceof PrintJobError) return { error: error.message };
    return { error: "Não foi possível reimprimir." };
  }
  revalidatePath("/impressao");
  return { error: null };
}
