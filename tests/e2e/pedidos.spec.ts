import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_USER_EMAIL;
const password = process.env.E2E_TEST_USER_PASSWORD;
// createOrder faz várias consultas sequenciais dentro da transação
// (idempotência, sessão, pessoas, produtos, modificadores, grupos,
// sequenceNumber, criação, recálculo de totais) — soma alguns segundos
// neste ambiente, então a folga aqui é maior que nos outros specs.
const NAV_TIMEOUT = 30000;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/", { timeout: NAV_TIMEOUT });
}

const suffix = Date.now().toString(36);

test.describe("Módulo 4 — pedidos", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Defina E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD.");
    await login(page);
  });

  test("lança pedido com adicional, vê na comanda e cancela o item", async ({ page }) => {
    const sectorName = `Parrilla PED ${suffix}`;
    const categoryName = `Carnes PED ${suffix}`;
    const productName = `Bife PED ${suffix}`;
    const tableNumber = `PED-${suffix}`;

    // Cadastro (Módulo 2).
    await page.goto("/admin/setores");
    await page.getByLabel("Nome").fill(sectorName);
    await page.getByRole("button", { name: "Criar setor" }).click();
    await expect(page.getByText(sectorName)).toBeVisible({ timeout: NAV_TIMEOUT });

    await page.goto("/admin/categorias");
    await page.getByLabel("Nome").fill(categoryName);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(page.getByText(categoryName)).toBeVisible({ timeout: NAV_TIMEOUT });

    await page.goto("/admin/produtos");
    await page.getByLabel("Nome").fill(productName);
    await page.getByLabel("Preço (R$)").fill("50.00");
    await page.getByLabel("Categoria").selectOption({ label: categoryName });
    await page.getByLabel("Setor de destino").selectOption({ label: sectorName });
    await page.getByRole("button", { name: "Criar produto" }).click();
    const productRow = page.locator("tr", { hasText: productName });
    await expect(productRow).toBeVisible({ timeout: NAV_TIMEOUT });
    await productRow.getByRole("link", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos\/.+\/editar/, { timeout: NAV_TIMEOUT });

    await page.getByLabel("Nome do grupo").fill("Ponto");
    await page.getByRole("button", { name: "Criar grupo" }).click();
    await expect(page.getByLabel("Grupo")).toHaveValue("Ponto", { timeout: NAV_TIMEOUT });
    await page.getByLabel("Novo adicional").fill("Manteiga extra");
    await page.getByLabel("Valor (R$)").fill("3.00");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByLabel("Nome", { exact: true }).last()).toHaveValue("Manteiga extra", {
      timeout: NAV_TIMEOUT,
    });

    await page.goto("/admin/mesas");
    await page.getByLabel("Número ou nome").fill(tableNumber);
    await page.getByRole("button", { name: "Criar mesa" }).click();
    await expect(page.getByText(tableNumber)).toBeVisible({ timeout: NAV_TIMEOUT });

    // Abre a mesa (Módulo 3).
    await page.goto("/mesas");
    await page.getByRole("link", { name: new RegExp(tableNumber) }).click();
    await expect(page.getByRole("heading", { name: "Abrir mesa" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await page.getByLabel("Quantidade de pessoas").fill("1");
    await page.getByRole("button", { name: "Abrir mesa" }).click();
    await expect(page.getByText("Aberto", { exact: false })).toBeVisible({ timeout: NAV_TIMEOUT });

    // Lança o pedido (Módulo 4).
    await page.getByRole("link", { name: "Pedidos", exact: true }).click();
    await expect(page).toHaveURL(/\/pedidos$/, { timeout: NAV_TIMEOUT });
    await page.getByRole("link", { name: "+ Novo pedido" }).click();
    await expect(page).toHaveURL(/\/pedidos\/novo$/, { timeout: NAV_TIMEOUT });

    const productSelect = page.getByLabel("Produto");
    const productOptionValue = await productSelect
      .locator("option", { hasText: productName })
      .getAttribute("value");
    await productSelect.selectOption(productOptionValue!);
    await page.getByLabel("Quantidade").fill("2");
    await page.getByText("Manteiga extra").click();
    await page.getByRole("button", { name: "Adicionar ao pedido" }).click();
    await expect(page.getByText("2x " + productName)).toBeVisible();

    await page.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page).toHaveURL(/\/pedidos$/, { timeout: NAV_TIMEOUT });
    await expect(page.getByText("2x " + productName)).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByText("Manteiga extra", { exact: false })).toBeVisible();

    // Comanda mostra o subtotal real: (50 + 3) * 2 = 106,00.
    await page.getByRole("link", { name: "Comanda" }).click();
    await expect(page).toHaveURL(/\/mesas\/[^/]+$/, { timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("resumo-subtotal")).toHaveText("R$ 106,00", {
      timeout: NAV_TIMEOUT,
    });
    await expect(page.getByTestId("resumo-total")).toHaveText("R$ 106,00");
    await expect(page.getByTestId("resumo-saldo")).toHaveText("R$ 106,00");

    // Cancela o item (usuário de teste é Admin — autoriza direto).
    await page.getByRole("link", { name: "Pedidos", exact: true }).click();
    await expect(page).toHaveURL(/\/pedidos$/, { timeout: NAV_TIMEOUT });
    await page.getByPlaceholder("Motivo").fill("Cliente desistiu do prato");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Cancelado:", { exact: false })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });

    // Comanda reflete o cancelamento — subtotal volta a zero.
    await page.getByRole("link", { name: "Comanda" }).click();
    await expect(page).toHaveURL(/\/mesas\/[^/]+$/, { timeout: NAV_TIMEOUT });
    await expect(page.getByTestId("resumo-subtotal")).toHaveText("R$ 0,00", {
      timeout: NAV_TIMEOUT,
    });
  });
});
