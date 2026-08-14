import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canOpenTable } from "@/domain/table/states";
import { publishChange } from "@/lib/realtime/publish";
import { restaurantTablesChannel, tableChannel } from "@/lib/realtime/channels";
import { runAfterResponse } from "@/lib/run-after-response";

// Erro de negócio (mesa não livre / corrida) — distinto de erro de
// validação de formulário ou erro inesperado, para quem chama decidir a
// mensagem certa sem precisar inspecionar stack de Prisma.
export class OpenTableError extends Error {}

const openTableSchema = z.object({
  tableId: z.string().min(1),
  waiterId: z.string().min(1, "Selecione o garçom responsável"),
  guestCount: z.coerce.number().int().min(1, "Informe ao menos 1 pessoa").max(50),
  responsibleName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  guestNames: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
});

// Não deriva de z.input porque z.coerce.number() aceita string/number na
// prática (é o ponto de coagir), mas o tipo dele varia entre versões do
// Zod — definir explícito evita ambiguidade no call site.
export type OpenTableInput = {
  tableId: string;
  waiterId: string;
  guestCount: number | string;
  responsibleName?: string;
  guestNames?: string[];
};

// Abre um atendimento para uma mesa — transacional (CLAUDE.md regra 17) e
// com duas camadas de defesa contra a regra 1 (uma mesa, um atendimento
// ativo por vez): checagem do status da mesa dentro da transação, e o
// índice único parcial do banco (docs/database/schema.md §4) como rede de
// segurança final contra corrida (dois cliques quase simultâneos).
export async function openTable(input: OpenTableInput) {
  const data = openTableSchema.parse(input);

  try {
    const session = await prisma.$transaction(async (tx) => {
      const table = await tx.table.findUniqueOrThrow({ where: { id: data.tableId } });

      if (!canOpenTable(table.status)) {
        throw new OpenTableError("Esta mesa não está livre. Atualize a página e tente de novo.");
      }

      const created = await tx.serviceSession.create({
        data: {
          restaurantId: table.restaurantId,
          type: "TABLE",
          tableId: data.tableId,
          waiterId: data.waiterId,
          guestCount: data.guestCount,
          responsibleName: data.responsibleName,
          guests: {
            create: data.guestNames.map((name, index) => ({ name, sortOrder: index })),
          },
        },
      });

      await tx.table.update({ where: { id: data.tableId }, data: { status: "OCCUPIED" } });

      return { ...created, restaurantId: table.restaurantId };
    });

    // Fora da transação — só depois de confirmado que a mesa realmente
    // abriu (regra 17/CLAUDE.md: efeito colateral não crítico não entra na
    // transação de negócio). Via runAfterResponse (Fase 2 da otimização
    // de performance): o garçom não precisa esperar essa chamada de rede
    // extra pra ver a mesa aberta.
    await runAfterResponse(() =>
      publishChange(
        [tableChannel(data.tableId), restaurantTablesChannel(session.restaurantId)],
        "table.opened",
      ),
    );

    return session;
  } catch (error) {
    if (error instanceof OpenTableError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OpenTableError("Esta mesa já tem um atendimento ativo.");
    }
    throw error;
  }
}
