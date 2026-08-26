import { chromium } from "playwright";
import fs from "fs";

const EMAIL = process.env.APPBARBER_EMAIL;
const PASS = process.env.APPBARBER_PASS;
const OUT = "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/api-discovery";

const CTRLS = [
  "caixaCtrl.js",
  "agendaCtrl.js",
  "estoqueCtrl.js",
  "pacotesCtrl.js",
  "clubeVantagensCtrl.js",
  "listaDeEsperaCtrl.js",
  "noticiasCtrl.js",
  "anamneseCtrl.js",
  "parametrosCtrl.js",
  "profissionaisCtrl.js",
  "servicosCtrl.js",
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "pt-BR" });
const page = await ctx.newPage();

await page.goto("https://sistema.appbarber.com.br/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
for (const t of ["Aceitar tudo"]) {
  const b = page.getByRole("button", { name: t });
  if (await b.count()) await b.first().click().catch(() => {});
}
await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
await page.locator("input[type='password']:visible").first().fill(PASS);
await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
await page.waitForTimeout(4000);

const found = {};
for (const name of CTRLS) {
  const url = `https://sistema.appbarber.com.br/js/controllers/${name}`;
  const res = await ctx.request.get(url);
  const text = await res.text();
  if (res.ok() && !text.includes("não foi encontrado") && text.length > 200) {
    fs.writeFileSync(`${OUT}/${name}`, text);
    const urls = [...text.matchAll(/["'](\/pages\/[^"']+\.php)["']/g)].map((m) => m[1]);
    found[name] = [...new Set(urls)];
    console.log("OK", name, found[name].length);
  } else {
    console.log("MISS", name, res.status());
  }
}

// Probe specific endpoints with a sample client from export
const clients = JSON.parse(
  fs.readFileSync(
    "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export/2026-08-26T14-56-45/clientes.json",
    "utf8"
  )
);
const sample = clients.find((c) => c.Pontos && Number(c.Pontos) > 0) || clients[10];
const codigo = sample.Codigo;
console.log("sample client", sample.Nome, codigo, "pontos", sample.Pontos);

const probes = [
  ["GET", `/pages/cadastros/buscaListaPontoItens.php?pescodigo=${codigo}`],
  ["GET", `/pages/cadastros/buscaListaPontosResgate.php?pescodigo=${codigo}`],
  ["POST", `/pages/cadastros/buscaPessoaServicoCliente.php`, `pescodigo=${codigo}`],
  ["GET", `/pages/cadastros/buscaClienteTag.php?pescodigo=${codigo}`],
  ["POST", `/pages/cadastros/buscaClienteTag.php`, `pescodigo=${codigo}`],
  ["GET", `/pages/cadastros/CLIENTEBuscaAcessoLista.php?pescodigo=${codigo}`],
  ["POST", `/pages/cadastros/buscaClubeCliente.php`, ``],
  ["GET", `/pages/cadastros/buscaClubeCliente.php`],
  ["POST", `/pages/cadastros/buscaListaEspera.php`, `dataIni=01/01/2024&dataFim=26/08/2026`],
  ["GET", `/pages/cadastros/buscaNoticias.php`],
  ["POST", `/pages/cadastros/buscaNoticias.php`, ``],
];

const results = [];
for (const [method, path, body] of probes) {
  const url = `https://sistema.appbarber.com.br${path}`;
  try {
    const res =
      method === "GET"
        ? await ctx.request.get(url)
        : await ctx.request.post(url, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: body || "",
          });
    const text = (await res.text()).replace(/^\uFEFF/, "").slice(0, 500);
    results.push({ method, path, status: res.status(), preview: text });
    console.log(res.status(), method, path.slice(0, 70), text.slice(0, 80).replace(/\s+/g, " "));
  } catch (e) {
    results.push({ method, path, error: String(e) });
  }
}

fs.writeFileSync(`${OUT}/extra-probes.json`, JSON.stringify({ found, sample, results }, null, 2));
await browser.close();
