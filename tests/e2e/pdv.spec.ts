import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_TEST_USER_EMAIL;
const password = process.env.E2E_TEST_USER_PASSWORD;
// registerCombinedCheckout compõe createOrder + requestClosing +
// registerPayment (mesa e PDV) + closeTable numa transação só — soma mais
// idas e vindas que um pedido isolado (ver pedidos.spec.ts). Este spec
// também navega por bem mais rotas que os outros (setores, categorias,
// produto novo, mesas, pedidos, pdv) — cada primeira compilação de rota
// soma vários segundos neste ambiente (proxy TLS corporativo), daí a
// folga maior aqui.
const NAV_TIMEOUT = 45000;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(password!);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Usuário de teste é Administrador — cai direto em /admin/mesas
  // (getPostLoginPath), não mais em "/".
  await expect(page).toHaveURL(/\/admin\/mesas/, { timeout: NAV_TIMEOUT });
}

// Cadastra categoria + setor uma vez só — reaproveitados por quantos
// produtos o teste precisar (cada ida a /admin/setores ou /admin/categorias
// soma segundos neste ambiente, ver NAV_TIMEOUT acima; não vale repetir
// por produto quando o teste só precisa de QUALQUER categoria/setor
// válidos, não de um específico por item). "E2E" no nome é o que
// tests/scripts/cleanup-e2e-test-data.ts usa pra achar e apagar depois.
async function createCategoryAndSector(page: Page, suffix: string) {
  const sectorName = `Setor PDV-E2E ${suffix}`;
  const categoryName = `Categoria PDV-E2E ${suffix}`;

  await page.goto("/admin/setores");
  await page.getByLabel("Nome").fill(sectorName);
  await page.getByRole("button", { name: "Criar setor" }).click();
  // Escopado por <tr>: /admin/setores e /admin/categorias têm um CardList
  // escondido (md:hidden) com o mesmo texto desde a Fase 10 do plano de
  // modernização — getByText sem escopo bate nos dois.
  await expect(page.locator("tr", { hasText: sectorName })).toBeVisible({ timeout: NAV_TIMEOUT });

  await page.goto("/admin/categorias");
  await page.getByLabel("Nome").fill(categoryName);
  await page.getByRole("button", { name: "Criar categoria" }).click();
  await expect(page.locator("tr", { hasText: categoryName })).toBeVisible({
    timeout: NAV_TIMEOUT,
  });

  return { categoryName, sectorName };
}

async function createProduct(
  page: Page,
  name: string,
  price: string,
  categoryName: string,
  sectorName: string,
) {
  await page.goto("/admin/produtos/novo");
  // exact: true — o formulário ampliado (ADR 0009) também tem "Nome do
  // fornecedor (opcional)", que combina com "Nome" por substring.
  await page.getByLabel("Nome", { exact: true }).fill(name);
  await page.getByLabel("Preço de venda").fill(price);
  await page.getByLabel("Categoria").selectOption({ label: categoryName });
  await page.getByLabel("Setor de destino").selectOption({ label: sectorName });
  await page.getByRole("button", { name: "Criar produto" }).click();
  // A ação não redireciona no servidor (mesmo padrão de outros formulários
  // do projeto) — volta pra /admin/produtos só depois do toast de sucesso.
  await expect(page.locator("tr", { hasText: name })).toBeVisible({ timeout: NAV_TIMEOUT });
}

// Busca o produto na tela do PDV e toca no card pra adicionar 1 unidade —
// mesmo campo de busca que um leitor de código de barras usaria.
async function addProductToPdvCart(page: Page, productName: string) {
  await page.getByLabel("Buscar produto").fill(productName);
  await page.getByRole("button", { name: new RegExp(productName) }).click();
  await page.getByLabel("Buscar produto").fill("");
}

test.describe("Módulo 17 — PDV e Pagamento Combinado (ADR 0010)", () => {
  // Spec mais pesado da suíte — navega por bem mais rotas que os outros
  // (setores, categorias, produto novo ×2, mesas, pedidos, pdv) e o
  // Pagamento Combinado compõe 4 operações numa transação só. Timeout
  // padrão (30s) não sobra nem pra uma única primeira compilação de rota
  // neste ambiente (proxy TLS corporativo) — confirmado rodando local
  // (4m+ só pro teste mais simples).
  test.describe.configure({ timeout: 360000 });

  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, "Defina E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD.");
    await login(page);
  });

  test("venda de balcão pura: busca, carrinho, troco e confirmação", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const productName = `Produto PDV-E2E ${suffix}`;
    const { categoryName, sectorName } = await createCategoryAndSector(page, suffix);
    await createProduct(page, productName, "25.00", categoryName, sectorName);

    await page.goto("/pdv");
    await addProductToPdvCart(page, productName);
    await expect(page.getByTestId("pdv-cart-item-count")).toHaveText("1 item(ns)", {
      timeout: NAV_TIMEOUT,
    });

    await page.getByRole("button", { name: "Receber" }).click();
    await expect(page.getByRole("heading", { name: "Receber" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await expect(page.getByTestId("pdv-checkout-total")).toHaveText("R$ 25,00");

    // Troco: "recebido em dinheiro" é só informação de impressão (decisão
    // do usuário) — digitar 30 pra um total de 25 não deve travar a
    // confirmação nem alterar o valor que de fato é registrado (o
    // recibo, não testado aqui via UI, é quem mostra o troco — ver
    // tests/integration/print-jobs.test.ts).
    await page.getByLabel("Recebido em dinheiro (opcional, só para calcular o troco)").fill("30");
    await expect(page.getByText("Troco: R$ 5,00")).toBeVisible();
    await expect(page.getByText("Valor confere com o total da venda.")).toBeVisible();

    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect(page.getByText("Venda registrada.")).toBeVisible({ timeout: NAV_TIMEOUT });
    // Carrinho volta ao estado vazio — pronto pra próxima venda sem
    // recarregar a página.
    await expect(page.getByText("Toque num produto para adicionar à venda.")).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
  });

  test("Pagamento Combinado: consumo de mesa + produto de loja numa confirmação só", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const mesaProductName = `Prato PDV-E2E ${suffix}`;
    const lojaProductName = `Loja PDV-E2E ${suffix}`;
    const tableNumber = `PDV-E2E-${suffix}`;

    const { categoryName, sectorName } = await createCategoryAndSector(page, suffix);
    await createProduct(page, mesaProductName, "40.00", categoryName, sectorName);
    await createProduct(page, lojaProductName, "15.00", categoryName, sectorName);

    // Cadastra e abre a mesa, lança 1 unidade do produto "de mesa".
    await page.goto("/admin/mesas/nova");
    await page.getByLabel("Número ou nome").fill(tableNumber);
    await page.getByRole("button", { name: "Criar mesa" }).click();
    await expect(page.getByText(tableNumber)).toBeVisible({ timeout: NAV_TIMEOUT });

    await page.goto("/mesas");
    await page.getByRole("link", { name: new RegExp(tableNumber) }).click();
    await expect(page).toHaveURL(/\/mesas\/[^/]+$/, { timeout: NAV_TIMEOUT });
    const tableUrl = page.url();

    await expect(page.getByRole("heading", { name: "Abrir mesa" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await page.getByLabel("Quantidade de pessoas").fill("1");
    await page.getByRole("button", { name: "Abrir mesa" }).click();
    await expect(page.getByText("Aberto", { exact: false })).toBeVisible({ timeout: NAV_TIMEOUT });

    await page.getByRole("link", { name: "Novo pedido" }).click();
    await expect(page).toHaveURL(/\/pedidos\/novo$/, { timeout: NAV_TIMEOUT });
    // Produto não é um <select> — é um filtro de categoria (abas) + grupo
    // de botões (radiogroup "Produto"), cada produto some/aparece conforme
    // a categoria escolhida.
    await page.getByRole("tab", { name: categoryName }).click();
    await page.getByRole("radio", { name: mesaProductName }).click();
    await page.getByRole("button", { name: "Adicionar ao pedido" }).click();
    await expect(page.getByText("1x " + mesaProductName)).toBeVisible();
    await page.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(page).toHaveURL(/\/mesas\/[^/]+$/, { timeout: NAV_TIMEOUT });
    // getByRole("listitem") — "1x {produto}" também existe escondido no
    // texto padrão do diálogo de cancelamento daquele item (sempre no DOM,
    // só abre sob clique) e duplicado numa segunda lista; o item de
    // verdade na comanda é sempre um <li>.
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "1x " + mesaProductName })
        .first(),
    ).toBeVisible({ timeout: NAV_TIMEOUT });

    // PDV: "+ Adicionar consumo de mesa" — seleciona a mesa recém-aberta,
    // paga o item inteiro (seleção, nada gravado ainda).
    await page.goto("/pdv");
    // Dois botões "+ Adicionar consumo de mesa" existem no DOM ao mesmo
    // tempo (um só pra celular, outro só pro painel fixo do desktop — CSS
    // alterna qual aparece, os dois continuam no documento) — testid
    // evita a ambiguidade de "getByRole" achar os dois.
    await page.getByTestId("pdv-add-table-desktop").click();
    await expect(page.getByRole("heading", { name: "Adicionar consumo de mesa" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await page.getByRole("button", { name: new RegExp(`Mesa ${tableNumber}`) }).click();
    // listitem — o mesmo produto também aparece no grid da loja atrás do
    // modal (é um produto normal do catálogo, não só "de mesa"); o item
    // selecionável dentro do seletor de consumo é sempre um <li>.
    await expect(
      page.getByRole("listitem").filter({ hasText: mesaProductName }).first(),
    ).toBeVisible({ timeout: NAV_TIMEOUT });
    await page.getByRole("button", { name: "Pagar inteiro" }).click();
    await page.getByRole("button", { name: "Confirmar seleção" }).click();

    // Carrinho do PDV mostra a mesa selecionada ao lado dos produtos de
    // loja — adiciona o produto de loja e confirma o recebimento. testid
    // evita ambiguidade com "Mesa X" repetido na barra mobile/botão (CSS
    // alterna qual aparece, os dois continuam no DOM).
    await expect(page.getByTestId("pdv-cart-table-chip")).toHaveText(`Mesa ${tableNumber}`, {
      timeout: NAV_TIMEOUT,
    });
    await addProductToPdvCart(page, lojaProductName);
    await expect(page.getByTestId("pdv-cart-total")).toHaveText("R$ 55,00"); // 40 + 15

    await page.getByRole("button", { name: "Receber" }).click();
    await expect(page.getByRole("heading", { name: "Receber" })).toBeVisible({
      timeout: NAV_TIMEOUT,
    });
    await expect(page.getByTestId("pdv-checkout-total")).toHaveText("R$ 55,00");
    // Duas origens, cada uma com sua própria forma de pagamento (decisão
    // do usuário: divisão por origem é manual, nunca automática).
    await expect(page.getByLabel("Forma de pagamento da mesa")).toBeVisible();
    await expect(page.getByText(`Loja · R$ 15,00`)).toBeVisible();
    await expect(page.getByText("Valor confere com o total da venda.")).toBeVisible();

    await page.getByRole("button", { name: "Confirmar venda" }).click();
    await expect(page.getByText("Venda registrada.")).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(page.getByText("Toque num produto para adicionar à venda.")).toBeVisible({
      timeout: NAV_TIMEOUT,
    });

    // A mesa nunca fecha por causa do Pagamento Combinado (ADR 0010, seção
    // 9) — continua aberta, só o saldo caiu com o item que acabou de ser
    // pago pelo PDV.
    await page.goto(tableUrl);
    await expect(page.getByText("Aberto", { exact: false })).toBeVisible({ timeout: NAV_TIMEOUT });
    await page.getByTestId("financeiro-toggle").click();
    await expect(page.getByTestId("resumo-saldo")).toHaveText("R$ 0,00", { timeout: NAV_TIMEOUT });
  });
});
