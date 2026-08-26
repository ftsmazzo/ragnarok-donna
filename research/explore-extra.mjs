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
  ["pacotes-venda", "#/pacotesVenda"],
  ["assinaturas", "#/assinaturas"],
  ["noticias", "#/noticias"],
  ["rodizio", "#/rodizio"],
  ["relatorio-agendamento", "#/relatorioagendamento"],
  ["relatorio-gerencial-financeiro", "#/relatoriogerencialfinanceiro"],
  ["relatorio-estoque", "#/relGerencialEstoque"],
  ["conta-cliente", "#/contacliente"],
  ["conta-profissional", "#/contaProfissional"],
  ["caixinha", "#/caixinha"],
  ["restricoes", "#/restricaoCliente"],
  ["aniversariantes", "#/relAniversariantes"],
];

async function dismiss(page) {
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) {
      try { await b.first().click({ timeout: 1500 }); } catch {}
    }
  }
}

async function shot(page, name, list) {
  const file = path.join(OUT, `X-${String(list.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  list.push({ name, file, url: page.url() });
  console.log("SHOT", name);
}

async function meta(page) {
  return page.evaluate(() => ({
    hash: location.hash,
    text: (document.querySelector(".content-wrapper, .content, main, #app") || document.body)
      .innerText.slice(0, 800)
      .replace(/\s+/g, " "),
    headings: [...document.querySelectorAll("h1,h2,h3,.content-header")]
      .map((e) => e.textContent.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 8),
  }));
}

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
const shots = [];
for (const [name, hash] of HASHES) {
  try {
    await page.goto(`https://sistema.appbarber.com.br/index.php${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    await dismiss(page);
    for (let i = 0; i < 10; i++) {
      const loading = page.locator("text=Carregando...");
      if (!(await loading.count()) || !(await loading.first().isVisible().catch(() => false))) break;
      await page.waitForTimeout(700);
    }
    const m = await meta(page);
    await shot(page, name, shots);
    results.push({ name, hash, ...m });
  } catch (e) {
    results.push({ name, hash, error: String(e).slice(0, 200) });
  }
}
fs.writeFileSync(EXTRA, JSON.stringify({ results }, null, 2));
await browser.close();
console.log("DONE extra");

