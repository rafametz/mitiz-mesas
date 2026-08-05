import { defineConfig } from "@playwright/test";

// `playwright test` não carrega .env sozinho (diferente do `next dev`, que
// carrega automaticamente) — precisamos das variáveis de teste (usuário de
// teste do seed) disponíveis aqui também.
try {
  process.loadEnvFile(".env");
} catch {
  // .env pode não existir (ex.: CI, onde as variáveis já vêm do ambiente).
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
