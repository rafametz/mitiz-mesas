import { defineConfig } from "vitest/config";
import path from "node:path";

// Config separada de vitest.config.ts (que cobre os unitários, sem I/O de
// propósito) só pra acrescentar o globalSetup que desativa a impressora
// real durante a suíte (tests/integration/global-setup.ts — ver comentário
// lá pro motivo: risco real de imprimir ticket de teste na impressora
// física do restaurante). Não faz sentido pagar esse custo (2 round-trips
// ao banco) toda vez que só os unitários rodam.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    // Mesmo motivo do vitest.config.ts: latência de rede real do Supabase
    // + transações que gravam PrintJob passam do padrão de 5s.
    testTimeout: 15000,
    // Todos os arquivos compartilham o mesmo Restaurant real (banco único,
    // dev=prod) — rodar os arquivos em paralelo faz várias transações
    // Serializable colidirem entre si (createOrder já tem retry de até 3
    // tentativas pra isso, mas sob paralelismo de 7+ arquivos às vezes
    // estoura o orçamento — observado ao acrescentar pickup.test.ts,
    // módulo Retiradas 2026-08-14: mesmos testes já existentes passaram a
    // falhar de forma intermitente, sem relação com o código deles).
    // Arquivos ainda rodam um de cada vez (mais lento, mas confiável);
    // testes dentro de um mesmo arquivo continuam paralelos entre si.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
