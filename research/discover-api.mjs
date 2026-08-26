import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = process.env.APPBARBER_EMAIL;
const PASS = process.env.APPBARBER_PASS;
if (!EMAIL || !PASS) {
  console.error("Set APPBARBER_EMAIL and APPBARBER_PASS env vars");
  process.exit(1);
}

const OUT = path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/api-discovery");
fs.mkdirSync(OUT, { recursive: true });

const seen = new Map(); // key -> sample

function record(req, resBody) {
  const url = req.url();
  if (!url.includes("appbarber.com.br")) return;
  if (/\.(png|jpg|jpeg|gif|css|woff2?|ttf|ico|svg)(\?|$)/i.test(url)) return;
  const method = req.method();
  const key = `${method} ${url.split("?")[0]}`;
  const entry = seen.get(key) || {
    method,
    urlBase: url.split("?")[0],
    samples: [],
    querySamples: new Set(),
    status: [],
  };
  try {
    const u = new URL(url);
    if (u.search) entry.querySamples.add(u.search.slice(0, 300));
  } catch {}
  if (entry.samples.length < 3) {
    entry.samples.push({
      fullUrl: url.slice(0, 500),
      postData: (req.postData() || "").slice(0, 800),
      responsePreview: typeof resBody === "string" ? resBody.slice(0, 1200) : "",
    });
  }
  seen.set(key, entry);
}

async function dismiss(page) {
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) {
      try { await b.first().click({ timeout: 1500 }); } catch {}
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();

  page.on("response", async (res) => {
    try {
      const req = res.request();
      const ct = (res.headers()["content-type"] || "").toLowerCase();
      let body = "";
      if (ct.includes("json") || ct.includes("text") || ct.includes("javascript")) {
        body = await res.text().catch(() => "");
      }
      const entryKey = `${req.method()} ${req.url().split("?")[0]}`;
      record(req, body);
      const e = seen.get(entryKey);
      if (e) e.status.push(res.status());
    } catch {}
  });

  await page.goto("https://sistema.appbarber.com.br/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(6000);
  await dismiss(page);

  const hashes = [
    "#/agenda",
    "#/clientes",
    "#/profissionais",
    "#/servicos",
    "#/estoque",
    "#/pacotes",
    "#/comandasabertas",
    "#/comandashistorico",
    "#/caixa",
    "#/comissaoprofissionais",
    "#/listaDeEspera",
    "#/clubeVantagens",
    "#/funcionamentoEmpresa",
    "#/parametros",
  ];

  for (const hash of hashes) {
    console.log("visit", hash);
    await page.goto(`https://sistema.appbarber.com.br/index.php${hash}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3500);
    await dismiss(page);
    // try bump page size / search to trigger list APIs
    const sel = page.locator("select").filter({ hasText: "1000" }).or(page.locator("select:has(option:text-is('1000'))"));
    if (await page.locator("select").count()) {
      try {
        const s = page.locator("select").first();
        const opts = await s.locator("option").allTextContents();
        if (opts.some((o) => o.includes("1000") || o.includes("100"))) {
          await s.selectOption({ label: opts.find((o) => o.includes("1000")) || opts.find((o) => o.includes("100")) });
          await page.waitForTimeout(2500);
        }
      } catch {}
    }
  }

  const list = [...seen.values()].map((e) => ({
    method: e.method,
    urlBase: e.urlBase,
    statuses: [...new Set(e.status)],
    querySamples: [...e.querySamples].slice(0, 5),
    samples: e.samples,
  }));

  // Prefer API-looking endpoints
  const apiish = list.filter(
    (e) =>
      /api|ajax|json|php|cliente|servico|agenda|comanda|estoq|pacote|profission|caixa|comiss/i.test(
        e.urlBase
      )
  );

  fs.writeFileSync(path.join(OUT, "all-endpoints.json"), JSON.stringify(list, null, 2));
  fs.writeFileSync(path.join(OUT, "apiish-endpoints.json"), JSON.stringify(apiish, null, 2));
  console.log("total endpoints", list.length, "apiish", apiish.length);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
