import { expect, test } from "@playwright/test";

// Usa o usuário de teste criado por `prisma/seed.ts` (não é conta real).
// Sem as variáveis definidas, os testes são pulados em vez de falhar —
// não bloqueia quem não rodou o seed.
const email = process.env.E2E_TEST_USER_EMAIL;
const password = process.env.E2E_TEST_USER_PASSWORD;

test("rota protegida redireciona para /login quando não autenticado", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login com credenciais válidas entra e permite sair", async ({ page }) => {
  test.skip(
    !email || !password,
    "Defina E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD (ver prisma/seed.ts).",
  );

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Timeout maior aqui de propósito: o round-trip real (Server Action ->
  // Supabase Auth -> redirect -> Server Component -> Prisma) passa de 5s
  // em ambientes com latência de rede mais alta até o Supabase.
  await expect(page).toHaveURL("/", { timeout: 15000 });
  await expect(page.getByText("Usuário de Teste (seed)")).toBeVisible();
  await expect(page.getByText("Administrador")).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("login com senha errada mostra mensagem de erro", async ({ page }) => {
  test.skip(!email, "Defina E2E_TEST_USER_EMAIL (ver prisma/seed.ts).");

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill("senha-incorreta-123");
  await page.getByRole("button", { name: "Entrar" }).click();

  // getByRole("alert") também casa com o route-announcer interno do
  // Next.js — usar o texto diretamente evita o falso positivo.
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
