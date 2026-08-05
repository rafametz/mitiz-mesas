// Carrega .env para os testes (vitest, ao contrário do `next dev`, não faz
// isso sozinho). Necessário para os testes de integração, que conectam no
// Postgres/Supabase de verdade.
try {
  process.loadEnvFile(".env");
} catch {
  // .env pode não existir (ex.: CI, variáveis já vindas do ambiente).
}
