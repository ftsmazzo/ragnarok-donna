import { test, expect } from "@playwright/test";
import { e2eAuthConfigured, loginAsE2EUser } from "./helpers/auth";

test.describe("Smoke — pacotes / cliente", () => {
  test("rota /pacotes redireciona para login sem sessão", async ({ page }) => {
    await page.goto("/pacotes");
    await expect(page).toHaveURL(/\/login/);
  });

  test("venda de pacote: abrir modal, vincular cliente e ver Comprar", async ({
    page,
  }) => {
    test.skip(
      !e2eAuthConfigured(),
      "Defina E2E_EMAIL, E2E_PASSWORD e E2E_TENANT_SLUG para o smoke autenticado"
    );

    await loginAsE2EUser(page);
    await page.goto("/pacotes");
    await expect(page.getByRole("heading", { name: "Pacotes" })).toBeVisible();

    const sellBtn = page.getByTestId("pacotes-vender");
    await expect(sellBtn).toBeVisible();
    test.skip(
      (await sellBtn.isDisabled()) === true,
      "Nenhum pacote vendável neste tenant — cadastre/vincule um pacote"
    );

    await sellBtn.click();
    await expect(page.getByRole("heading", { name: "Venda de pacote" })).toBeVisible();
    const modal = page.getByTestId("package-sale-modal");
    await expect(modal).toBeVisible();

    const picker = page.getByTestId("client-picker-input");
    await picker.fill("a");
    await expect(page.getByTestId("client-picker-list")).toBeVisible();

    const firstClient = page.locator(".client-picker-item").first();
    await expect(firstClient).toBeVisible({ timeout: 20_000 });
    await firstClient.click();

    const packageSelect = page.getByTestId("package-sale-package");
    await packageSelect.selectOption({ index: 1 });

    const buy = page.getByTestId("package-sale-submit");
    await expect(buy).toBeEnabled();
    await expect(buy).toHaveText(/Comprar/);
  });
});
