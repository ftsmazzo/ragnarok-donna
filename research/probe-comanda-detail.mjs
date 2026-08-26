import { chromium } from "playwright";
import fs from "fs";

const EMAIL = process.env.APPBARBER_EMAIL;
const PASS = process.env.APPBARBER_PASS;
const OUT = "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/api-discovery";

async function dismiss(page) {
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) {
      try {
        await b.first().click({ timeout: 1500 });
      } catch {}
    }
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "pt-BR" });
const page = await context.newPage();
const hits = [];

page.on("response", async (res) => {
  try {
    const u = res.url();
    if (!/appbarber\.com\.br/i.test(u)) return;
    if (/\.(css|png|jpg|woff2?)(\?|$)/i.test(u)) return;
    const body = (await res.text().catch(() => "")).replace(/^\uFEFF/, "");
    const interesting =
      /comanda|item|consumo|CIt_|abreCom|buscaCom|pacote|infoCliente|historico|servicoProfissional/i.test(
        u
      );
    if (!interesting) return;
    hits.push({
      method: res.request().method(),
      url: u,
      post: (res.request().postData() || "").slice(0, 400),
      preview: body.slice(0, 700),
      status: res.status(),
    });
  } catch {}
});

await page.goto("https://sistema.appbarber.com.br/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await dismiss(page);
await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
await page.locator("input[type='password']:visible").first().fill(PASS);
await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
await page.waitForTimeout(4500);

// Download controllers for URL mining
const ctrlUrls = [
  "https://sistema.appbarber.com.br/js/controllers/comandasHistoricoCtrl.js",
  "https://sistema.appbarber.com.br/js/controllers/comandasAbertasCtrl.js",
  "https://sistema.appbarber.com.br/js/controllers/clientesCtrl.js",
];
for (const u of ctrlUrls) {
  const res = await context.request.get(u);
  const text = await res.text();
  const name = u.split("/").pop();
  fs.writeFileSync(`${OUT}/${name}`, text);
  const urls = [...text.matchAll(/["'](\/pages\/[^"']+\.php)["']/g)].map((m) => m[1]);
  console.log(name, "php refs", [...new Set(urls)].join("\n  "));
}

await page.goto("https://sistema.appbarber.com.br/index.php#/comandashistorico", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(5000);
await dismiss(page);

// Prefer table action Ver with ng-click abreComanda
const ver = page.locator("[ng-click*='abreComanda'], a.btn:has-text('Ver')").first();
console.log("abreComanda locators", await page.locator("[ng-click*='abreComanda']").count());
if (await page.locator("[ng-click*='abreComanda']").count()) {
  await page.locator("[ng-click*='abreComanda']").first().click({ force: true });
  await page.waitForTimeout(4500);
}

fs.writeFileSync(`${OUT}/comanda-detail-hits.json`, JSON.stringify(hits, null, 2));
console.log("hits", hits.length);
for (const h of hits) {
  if (/\.php/i.test(h.url)) {
    console.log(h.status, h.method, h.url.replace("https://sistema.appbarber.com.br", ""), h.post.slice(0, 80));
  }
}
await browser.close();
