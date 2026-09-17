/**
 * Export Conta do Cliente — AppBarber.
 *
 * $env:APPBARBER_EMAIL="..."; $env:APPBARBER_PASS="..."; node research/export-conta-cliente.mjs
 *
 * Estratégias (backup em camadas):
 * 1) Rede da tela #/contacliente (DataTables / endpoints)
 * 2) Ordenar por Saldo e paginar linhas ≠ 0
 * 3) buscaPessoaConta.php (tipo 5) por cliente — com strip de BOM
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = process.env.APPBARBER_EMAIL ?? process.env.APPBELEZA_EMAIL;
const PASS = process.env.APPBARBER_PASS ?? process.env.APPBELEZA_PASS;
const SYSTEM_BASE = (
  process.env.APPBARBER_BASE_URL ??
  process.env.APPBELEZA_BASE_URL ??
  "https://sistema.appbarber.com.br"
).replace(/\/$/, "");

const CLIENTS_EXPORT =
  process.env.APPBARBER_CLIENTS_JSON ||
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export/2026-09-13T12-25-22/clientes.json";

if (!EMAIL || !PASS) {
  console.error("Defina APPBARBER_EMAIL/APPBARBER_PASS");
  process.exit(1);
}

const ROOT = path.resolve(
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export"
);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(ROOT, `${STAMP}-conta-cliente`);
fs.mkdirSync(OUT, { recursive: true });

function saveJson(name, data) {
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`✓ ${name}.json`);
}

function parseBRL(v) {
  if (v == null) return 0;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "").trim();
}

function parseJsonLoose(text) {
  return JSON.parse(stripBom(text));
}

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

async function login(page) {
  await page.goto(`${SYSTEM_BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(4500);
  await dismiss(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();
  const networkHits = [];

  page.on("response", async (res) => {
    try {
      const url = res.url();
      if (!/pages\/(actions|cadastros|relatorios)\//i.test(url)) return;
      if (!/conta|credito|fiado|saldo|financeiro|cliente|pessoa/i.test(url)) return;
      const ct = res.headers()["content-type"] || "";
      if (!/json|javascript|text|html/i.test(ct)) return;
      const body = await res.text();
      networkHits.push({
        url,
        status: res.status(),
        body: body.slice(0, 800_000),
      });
    } catch {}
  });

  await login(page);

  await page.evaluate(() => {
    window.location.hash = "#/contacliente";
  });
  await page.waitForTimeout(5000);
  await dismiss(page);
  for (let i = 0; i < 20; i++) {
    const loading = page.locator("text=Carregando...");
    if (!(await loading.count()) || !(await loading.first().isVisible().catch(() => false)))
      break;
    await page.waitForTimeout(700);
  }

  // Totais do rodapé (prova operacional do AppBarber)
  const pageText = await page.evaluate(() =>
    (document.querySelector(".content-wrapper, .content, main, #app") || document.body)
      .innerText.slice(0, 30_000)
  );
  saveJson("contacliente-page-text", { text: pageText });

  const totalsMatch = pageText.match(
    /Total em débito:\s*R\$\s*([-\d.,]+).*Total com crédito:\s*R\$\s*([-\d.,]+).*Total:\s*R\$\s*([-\d.,]+)/s
  );
  const screenTotals = totalsMatch
    ? {
        debito: parseBRL(totalsMatch[1]),
        credito: parseBRL(totalsMatch[2]),
        total: parseBRL(totalsMatch[3]),
      }
    : null;

  // Ordenar por Saldo (2x = desc / asc) e capturar linhas da tabela
  const saldoHeader = page.locator("th", { hasText: /^Saldo$/i }).first();
  if (await saldoHeader.count()) {
    await saldoHeader.click();
    await page.waitForTimeout(1500);
    await saldoHeader.click();
    await page.waitForTimeout(2000);
  }

  // 100 por página
  const lengthSelect = page.locator("select[name*='length'], .dataTables_length select").first();
  if (await lengthSelect.count()) {
    await lengthSelect.selectOption("100").catch(() => {});
    await page.waitForTimeout(1500);
  }

  const tableRows = [];
  for (let pageIdx = 0; pageIdx < 60; pageIdx++) {
    const batch = await page.evaluate(() => {
      const rows = [];
      const trs = document.querySelectorAll("table.dataTable tbody tr, table tbody tr");
      for (const tr of trs) {
        const tds = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
        if (tds.length < 2) continue;
        const name = tds[0];
        const saldoRaw = tds[1];
        if (!name || /nenhum registro|no data/i.test(name)) continue;
        rows.push({ name, saldoRaw });
      }
      return rows;
    });
    for (const r of batch) {
      const saldo = parseBRL(r.saldoRaw);
      if (Math.abs(saldo) > 0.0001) tableRows.push({ ...r, saldo });
    }
    // Para se a página atual só tem zeros (já passou dos ≠0)
    if (batch.length && batch.every((r) => Math.abs(parseBRL(r.saldoRaw)) < 0.0001) && tableRows.length) {
      break;
    }
    const next = page.locator(".paginate_button.next:not(.disabled), a:has-text('Próximo')").first();
    if (!(await next.count()) || (await next.getAttribute("class"))?.includes("disabled")) break;
    await next.click().catch(() => null);
    await page.waitForTimeout(900);
  }
  saveJson("contacliente-table-nonzero", tableRows);

  try {
    await page.screenshot({ path: path.join(OUT, "contacliente.png"), fullPage: true });
  } catch {}

  saveJson("contacliente-network", networkHits);
  const parsedLists = [];
  for (const hit of networkHits) {
    try {
      const j = parseJsonLoose(hit.body);
      const rows = j.data || j.result || j.aaData || (Array.isArray(j) ? j : null);
      if (Array.isArray(rows) && rows.length) {
        parsedLists.push({ url: hit.url, count: rows.length, sample: rows[0] });
      }
    } catch {}
  }
  saveJson("contacliente-network-lists", parsedLists);

  // buscaPessoaConta — strip BOM
  const clients = JSON.parse(fs.readFileSync(CLIENTS_EXPORT, "utf8"));
  const clientRows = Array.isArray(clients) ? clients : clients.data || [];
  const codes = [
    ...new Set(
      clientRows
        .map((c) => String(c.Codigo || c.Cli_Codigo || "").trim())
        .filter((c) => c && c !== "0")
    ),
  ];
  console.log(`Consultando saldo de ${codes.length} clientes…`);

  const saldos = [];
  const errors = [];
  const concurrency = Number(process.env.APPBARBER_CONTA_CONCURRENCY || 8);

  async function fetchSaldo(codigo) {
    const res = await page.request.post(`${SYSTEM_BASE}/pages/actions/buscaPessoaConta.php`, {
      form: { tipo: "5", cliente: codigo },
    });
    const text = await res.text();
    const json = parseJsonLoose(text);
    const row = (json.result || json.data || [])[0];
    if (!row) return null;
    const saldoReal = Number(row.SaldoReal);
    const saldoParsed = Number.isFinite(saldoReal) ? saldoReal : parseBRL(row.PCo_Saldo);
    return { CodigoCliente: codigo, ...row, saldoParsed };
  }

  for (let i = 0; i < codes.length; i += concurrency) {
    const chunk = codes.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((c) => fetchSaldo(c)));
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled" && r.value) {
        if (Math.abs(r.value.saldoParsed || 0) > 0.0001) saldos.push(r.value);
      } else if (r.status === "rejected") {
        errors.push({ codigo: chunk[j], error: String(r.reason).slice(0, 240) });
      }
    }
    if (i % 400 === 0)
      console.log(`  ${Math.min(i + concurrency, codes.length)}/${codes.length} (≠0: ${saldos.length})`);
  }

  saldos.sort((a, b) => Math.abs(b.saldoParsed) - Math.abs(a.saldoParsed));
  const totalDivida = saldos
    .filter((s) => s.saldoParsed < 0)
    .reduce((a, s) => a + s.saldoParsed, 0);
  const totalCredito = saldos
    .filter((s) => s.saldoParsed > 0)
    .reduce((a, s) => a + s.saldoParsed, 0);

  // Merge tabela + API
  const byName = new Map(tableRows.map((r) => [r.name.toLowerCase(), r]));
  saveJson("conta-cliente-saldos-nonzero", saldos);
  saveJson("conta-cliente-errors", errors.slice(0, 50));
  saveJson("conta-cliente-manifest", {
    exportedAt: new Date().toISOString(),
    clientsScanned: codes.length,
    apiNonzero: saldos.length,
    tableNonzero: tableRows.length,
    apiDivida: totalDivida,
    apiCredito: totalCredito,
    screenTotals,
    tableDivida: tableRows.filter((r) => r.saldo < 0).reduce((a, r) => a + r.saldo, 0),
    tableCredito: tableRows.filter((r) => r.saldo > 0).reduce((a, r) => a + r.saldo, 0),
    note:
      "AppBarber Conta Cliente = fiado. Totais da tela são a fonte da verdade se a API por cliente vier zerada.",
    out: OUT,
    sampleNamesMatched: [...byName.keys()].slice(0, 5),
  });

  console.log(
    `API ≠0: ${saldos.length} | tabela ≠0: ${tableRows.length} | tela:`,
    screenTotals
  );
  console.log(OUT);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
