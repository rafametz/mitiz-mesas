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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
