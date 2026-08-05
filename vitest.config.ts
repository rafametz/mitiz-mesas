import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Testes de integração batem no Postgres real do Supabase (latência de
    // rede documentada no projeto todo) e algumas transações agora também
    // gravam PrintJob (Módulo 7) — o padrão de 5s do Vitest é apertado
    // demais pra isso. Não afeta os testes unitários (não têm I/O, sempre
    // terminam bem antes do teto).
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
