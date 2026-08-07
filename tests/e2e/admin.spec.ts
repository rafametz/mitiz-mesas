import { expect, test, type Page } from "@playwright/test";

// Usa o usuário de teste criado por `prisma/seed.ts` (perfil Admin).
const email = process.env.E2E_TEST_USER_EMAIL;
const password = process.env.E2E_TEST_USER_PASSWORD;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Usuário de teste é Administrador — cai direto em /admin/mesas
  // (getPostLoginPath), não mais em "/".
  await expect(page).toHaveURL(/\/admin\/mesas/, { timeout: 15000 });
}

// Sufixo único por execução — evita colisão com unique constraints
// (restaurantId+name) ao rodar o teste várias vezes contra o mesmo banco.
const suffix = Date.now().toString(36);

test.describe("Módulo 2 — cadastros básicos", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Defina E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD.");
    await login(page);
  });

  test("cria setor de produção e ele aparece na listagem", async ({ page }) => {
    const name = `Parrilla E2E ${suffix}`;
    await page.goto("/admin/setores");
    await page.getByLabel("Nome").fill(name);
    await page.getByRole("button", { name: "Criar setor" }).click();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("cria categoria e ela aparece na listagem", async ({ page }) => {
    const name = `Carnes E2E ${suffix}`;
    await page.goto("/admin/categorias");
    await page.getByLabel("Nome").fill(name);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByText(name)).toBeVisible();
  });

  test("cria mesa e ela aparece na listagem", async ({ page }) => {
    const number = `E2E-${suffix}`;
    await page.goto("/admin/mesas");
    await page.getByLabel("Número ou nome").fill(number);
    await page.getByRole("button", { name: "Criar mesa" }).click();
    await expect(page.getByText(number)).toBeVisible();
  });

  test("cria produto com categoria/setor, alterna disponibilidade e adiciona modificador", async ({
    page,
  }) => {
    const sectorName = `Bar E2E ${suffix}`;
    const categoryName = `Bebidas E2E ${suffix}`;
    const productName = `Chope Pilsen E2E ${suffix}`;

    await page.goto("/admin/setores");
    await page.getByLabel("Nome").fill(sectorName);
    await page.getByRole("button", { name: "Criar setor" }).click();
    await expect(page.getByText(sectorName)).toBeVisible();

    await page.goto("/admin/categorias");
    await page.getByLabel("Nome").fill(categoryName);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByText(categoryName)).toBeVisible();

    await page.goto("/admin/produtos");
    await page.getByLabel("Nome").fill(productName);
    await page.getByLabel("Preço (R$)").fill("12.90");
    await page.getByLabel("Categoria").selectOption({ label: categoryName });
    await page.getByLabel("Setor de destino").selectOption({ label: sectorName });
    await page.getByRole("button", { name: "Criar produto" }).click();

    const row = page.locator("tr", { hasText: productName });
    await expect(row).toBeVisible();
    await expect(row.getByText("R$")).toBeVisible();

    // Disponibilidade começa marcada "Sim" — alterna para "Não".
    await row.getByRole("button", { name: "Sim" }).click();
    await expect(row.getByRole("button", { name: "Não" })).toBeVisible();

    // Entra na edição para adicionar um grupo de modificadores.
    await row.getByRole("link", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos\/.+\/editar/);

    await page.getByLabel("Nome do grupo").fill("Tamanho");
    await page.getByRole("button", { name: "Criar grupo" }).click();
    // O grupo criado vira um mini-formulário de edição (campo "Grupo") —
    // o valor está no input, não em texto solto, então checa o value.
    await expect(page.getByLabel("Grupo")).toHaveValue("Tamanho");

    await page.getByLabel("Novo adicional").fill("Litrão");
    await page.getByLabel("Valor (R$)").fill("8.00");
    await page.getByRole("button", { name: "Adicionar" }).click();
    // getByLabel casa por substring por padrão ("Nome" também bateria em
    // "Nome do grupo") — exact:true evita isso.
    await expect(page.getByLabel("Nome", { exact: true }).last()).toHaveValue("Litrão");
  });
});
