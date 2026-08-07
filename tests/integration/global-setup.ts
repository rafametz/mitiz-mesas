// Setup global só do `npm run test:integration` (ver
// vitest.integration.config.ts) — roda UMA vez antes de toda a suíte, não
// por arquivo. Existe por um motivo grave: testes de integração criam
// pedidos de verdade via createOrder(), que sempre gera PrintJob (Módulo
// 7) vinculado à impressora ativa do restaurante — se o agente local
// (printer-agent/, processo separado, roda no PC ligado na impressora
// física) estiver de pé nesse momento, ele puxa e IMPRIME esses tickets de
// teste de verdade. Aconteceu (2026-08-07, ver commit que introduziu este
// arquivo) — o agente passou a iniciar sozinho com o Windows depois de
// uma mudança anterior, tornando esse acidente muito mais provável.
//
// Correção: desativa toda impressora ativa do restaurante ANTES da suíte
// rodar (createPrintJobsForOrder busca só `active: true` — sem isso, todo
// PrintJob nasce com printerId nulo, que o agente nunca reivindica) e
// reativa exatamente as mesmas no final, mesmo se algo falhar no meio.
// tests/integration/print-jobs.test.ts continua funcionando normalmente —
// ele cria a própria impressora de teste (já ativa) DEPOIS deste setup,
// sem ser afetada por isto.
import { PrismaClient } from "@prisma/client";

export default async function setup() {
  const prisma = new PrismaClient();
  try {
    const activePrinters = await prisma.printer.findMany({
      where: { active: true },
      select: { id: true },
    });
    const activePrinterIds = activePrinters.map((p) => p.id);

    if (activePrinterIds.length > 0) {
      await prisma.printer.updateMany({
        where: { id: { in: activePrinterIds } },
        data: { active: false },
      });
      console.log(
        `[global-setup] ${activePrinterIds.length} impressora(s) desativada(s) durante os testes de integração (nunca imprime de verdade).`,
      );
    }

    return async () => {
      if (activePrinterIds.length > 0) {
        await prisma.printer.updateMany({
          where: { id: { in: activePrinterIds } },
          data: { active: true },
        });
        console.log(`[global-setup] ${activePrinterIds.length} impressora(s) reativada(s).`);
      }
      await prisma.$disconnect();
    };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
