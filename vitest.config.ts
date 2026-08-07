import { defineConfig } from "vitest/config";
import path from "node:path";

// Config-padrão: só os unitários (sem I/O de propósito). Testes de
// integração têm config própria (vitest.integration.config.ts) —
// precisam de um globalSetup que este arquivo não deveria pagar toda vez
// (desativa a impressora real antes da suíte rodar, ver o motivo em
// tests/integration/global-setup.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
});
