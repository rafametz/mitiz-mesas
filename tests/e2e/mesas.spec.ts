import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_USER_EMAIL;
const password = process.env.E2E_TEST_USER_PASSWORD;

// Ambiente com round-trip mais lento até o Supabase (ver Módulo 1/2) — dá
// folga extra às asserções de navegação entre abas.
const NAV_TIMEOUT = 15000;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Usuário de teste é Administrador — cai direto em /admin/mesas
  // (getPostLoginPath), não mais em "/".
  await expect(page).toHaveURL(/\/admin\/mesas/, { timeout: NAV_TIMEOUT });
}

const suffix = Date.now().toString(36);

test.describe("Módulo 3 — mesas e atendimentos", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Defina E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD.");
    await login(page);
  });

  test("abre uma mesa, ela vira ocupada e não pode ser aberta de novo", async ({ page }) => {
    const tableNumber = `E2E-${suffix}`;

    // Cadastra a mesa via admin (Módulo 2), livre de propósito.
    await page.goto("/admin/mesas");
    await page.getByLabel("Número ou nome").fill(tableNumber);
    await page.getByRole("button", { name: "Criar mesa" }).click();
    await expect(page.getByText(tableNumber)).toBeVisible({ timeout: NAV_TIMEOUT });

    // Acha o card da mesa na visão de mesas e entra nela.
    await page.goto("/mesas");
    await page.getByRole("link", { name: new RegExp(tableNumber) }).click();
    await expect(page).toHaveURL(/\/mesas\/[^/]+$/, { timeout: NAV_TIMEOUT });

    // Formulário de abertura deve aparecer (mesa livre).
    await expect(page.getByRole("heading", { name: "Abrir mesa" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await page.getByLabel("Quantidade de pessoas").fill("2");
    await page.getByLabel("Responsável (opcional)").fill("Cliente Teste");
    await page.getByRole("button", { name: "+ adicionar nome" }).click();
    await page.getByPlaceholder("Pessoa 1").fill("Ana");
    await page.getByRole("button", { name: "Abrir mesa" }).click();

    // Depois de aberta: cabeçalho mostra "Aberto" — Comanda/Pedidos/Pessoas
    // vivem todos na mesma tela agora (refatoração mobile-first), sem abas.
    await expect(page.getByText("Aberto", { exact: false })).toBeVisible({ timeout: NAV_TIMEOUT });

    // Pessoas: o nome já informado na abertura aparece direto no bloco
    // compacto, sem precisar navegar nem expandir.
    await expect(page.getByText("Ana", { exact: true })).toBeVisible({ timeout: NAV_TIMEOUT });

    // Expande o bloco de Pessoas pra ver o responsável e adicionar alguém.
    await page.getByTestId("pessoas-toggle").click();
    await expect(page.getByText("Cliente Teste")).toBeVisible({ timeout: NAV_TIMEOUT });
    await page.getByLabel("Adicionar pessoa").fill("Beto");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Beto", { exact: true })).toBeVisible({ timeout: NAV_TIMEOUT });

    // Voltar para a visão de mesas: a mesa aparece ocupada — a regra "uma
    // mesa, um atendimento ativo" está valendo (não oferece abrir de novo).
    await page.goto("/mesas");
    const card = page.getByRole("link", { name: new RegExp(tableNumber) });
    await expect(card).toContainText("Ocupada", { timeout: NAV_TIMEOUT });
  });
});
