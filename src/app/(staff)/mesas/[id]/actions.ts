"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAnyPermission, requirePermission } from "@/application/auth/get-current-user";
import { openTable, OpenTableError } from "@/application/service-session/open-table";
import {
  GuestSettlementError,
  markGuestSettled,
  reopenGuest,
} from "@/application/guest/mark-guest-settled";
import {
  BillSummaryPrintError,
  createBillSummaryPrintJob,
} from "@/application/printing/create-bill-summary-print-job";
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

// Pagamento por pessoa (revisão 2026-08-10): marcar/desmarcar quitada é
// manual, sem cálculo obrigatório (decisão confirmada com o usuário) —
// mesma permissão de mexer em pessoas da mesa (TABLES_OPEN).
// Assinatura fixada pelo useActionState (prevState, formData) — nenhum
// dos dois é lido aqui (guestId já vem do bind, não há campo de formulário).
export async function markGuestSettledAction(
  tableId: string,
  guestId: string,
  _prevState: FormState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.TABLES_OPEN);
  try {
    await markGuestSettled(guestId, user.id);
  } catch (error) {
    if (error instanceof GuestSettlementError) return { error: error.message };
    return { error: "Não foi possível marcar esta pessoa como quitada." };
  }
  revalidatePath(`/mesas/${tableId}`);
  return { error: null };
}

export async function reopenGuestAction(
  tableId: string,
  guestId: string,
  _prevState: FormState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<FormState> {
  const user = await requirePermission(PERMISSIONS.TABLES_OPEN);
  try {
    await reopenGuest(guestId, user.id);
  } catch (error) {
    if (error instanceof GuestSettlementError) return { error: error.message };
    return { error: "Não foi possível reativar esta pessoa." };
  }
  revalidatePath(`/mesas/${tableId}`);
  return { error: null };
}

// "Imprimir conferência" (CLAUDE.md seção 10) — quem pode criar pedido,
// registrar pagamento ou já gerencia a fila de impressão (Garçom, Caixa,
// Admin); Produção fica de fora (não interage com a tela da mesa). Estado
// próprio (não o `FormState` compartilhado acima) porque o resultado
// também precisa dizer se existe impressora cadastrada, pro botão escolher
// o toast certo sem duplicar essa checagem no cliente.
export type PrintBillSummaryState = { error: string | null; printerConfigured: boolean | null };

export async function printBillSummaryAction(
  tableId: string,
  sessionId: string,
  _prevState: PrintBillSummaryState, // eslint-disable-line @typescript-eslint/no-unused-vars
  _formData: FormData, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<PrintBillSummaryState> {
  await requireAnyPermission([
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.PAYMENTS_REGISTER,
    PERMISSIONS.PRINT_JOBS_MANAGE,
  ]);
  try {
    const { printerConfigured } = await createBillSummaryPrintJob(sessionId);
    revalidatePath(`/mesas/${tableId}`);
    return { error: null, printerConfigured };
  } catch (error) {
    if (error instanceof BillSummaryPrintError) return { error: error.message, printerConfigured: null };
    return { error: "Não foi possível gerar o resumo da comanda.", printerConfigured: null };
  }
}
