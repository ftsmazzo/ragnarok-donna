import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = "REDACTED_EMAIL";
const PASS = "REDACTED_PASSWORD";
const OUT = path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/appbarber-screenshots");
const EXTRA = path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/appbarber-extra.json");

const HASHES = [
  ["servicos", "#/servicos"],
  ["pacotes", "#/pacotes"],
  ["assinaturas", "#/assinaturas"],
  ["noticias", "#/noticias"],
  ["rodizio", "#/rodizio"],
  ["relatorio-agendamento", "#/relatorioagendamento"],
  ["relatorio-gerencial-financeiro", "#/relatoriogerencialfinanceiro"],
];

async function dismiss(page) {
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) { try { await b.first().click({ timeout: 1500 }); } catch {} }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" })).newPage();
  await page.goto("https://sistema.appbarber.com.br/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(5000);
  await dismiss(page);
  const results = [];
  for (const [name, hash] of HASHES) {
    await page.goto("https://sistema.appbarber.com.br/index.php" + hash, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    await dismiss(page);
    const file = path.join(OUT, "Y-" + name + ".png");
    await page.screenshot({ path: file, fullPage: false });
    const text = await page.evaluate(() => (document.querySelector(".content-wrapper, .content, main, #app") || document.body).innerText.slice(0, 500).replace(/\s+/g, " "));
    results.push({ name, hash, text, file });
    console.log("OK", name);
  }
  fs.writeFileSync(EXTRA, JSON.stringify(results, null, 2));
  await browser.close();
}
main();

