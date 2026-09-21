/**
 * Exporta carteiras de pacotes vendidos no AppBarber (migração autorizada).
 *
 * Uso:
 *   $env:APPBARBER_EMAIL="..."; $env:APPBARBER_PASS="..."; node export-pacote-carteiras.mjs
 *
 * Saída: research/export/<stamp>-pacote-carteiras/
 *   - pacotes-com-venda.json   (templates Pac_Codigo)
 *   - pacotes-venda.json       (linhas Infov2 / PPa_*)
 *   - pacote-venda-detalhes.json (itens + Utilizados por PPa_Codigo)
 *   - pacotes-venda-ativos.json (só com crédito restante)
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

if (!EMAIL || !PASS) {
  console.error("Defina APPBARBER_EMAIL/APPBARBER_PASS (ou APPBELEZA_*)");
  process.exit(1);
}

const ROOT = path.resolve(
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export"
);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(ROOT, `${STAMP}-pacote-carteiras`);
fs.mkdirSync(OUT, { recursive: true });

const CONC = Number(process.env.APPBARBER_ITEM_CONCURRENCY || 6);
/** Se 1, exporta também pacotes 100% usados (histórico). Default: só com saldo. */
const INCLUDE_EXHAUSTED = process.env.APPBARBER_INCLUDE_EXHAUSTED === "1";

function saveJson(name, data) {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`✓ ${name}.json (${Array.isArray(data) ? data.length : typeof data})`);
  return file;
}

function stripHtmlFields(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (/^btn/i.test(k) || k === "DT_RowId") continue;
    if (typeof v === "string" && v.includes("<")) {
      out[k] = v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function toNum(v) {
  if (v == null || v === "") return 0;
  return Number(String(v).replace(",", ".")) || 0;
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
  const loginUrl = SYSTEM_BASE.includes("appbeleza")
    ? `${SYSTEM_BASE}/login.php`
    : `${SYSTEM_BASE}/`;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(5000);
  await dismiss(page);
  if (page.url().includes("login")) throw new Error("Login falhou");
}

async function fetchJson(request, url, options = {}, attempt = 1) {
  const maxAttempts = 5;
  try {
    const res = await request.fetch(url, { ...options, timeout: 180000 });
    const text = (await res.text()).replace(/^\uFEFF/, "").trim();
    if (!res.ok()) throw new Error(`${res.status()} ${url} → ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`JSON inválido em ${url}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = String(err?.message || err);
    const retryable = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|Timeout/i.test(msg);
    if (retryable && attempt < maxAttempts) {
      const wait = attempt * 1500;
      console.warn(`  retry ${attempt}/${maxAttempts} ${url.split("/").pop()} (${wait}ms)…`);
      await new Promise((r) => setTimeout(r, wait));
      return fetchJson(request, url, options, attempt + 1);
    }
    throw err;
  }
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
  });
  const page = await context.newPage();
  const request = context.request;

  console.log("Login…", SYSTEM_BASE);
  await login(page);

  console.log("Templates com venda (pessoav2)…");
  const listaJson = await fetchJson(
    request,
    `${SYSTEM_BASE}/pages/cadastros/buscaPacotePessoav2.php?draw=1&start=0&length=2000`
  );
  const templates = (listaJson.data || []).map(stripHtmlFields);
  saveJson("pacotes-com-venda", templates);

  console.log(`Carteiras Infov2 (${templates.length} templates)…`);
  const vendas = [];
  let doneTpl = 0;
  await mapPool(templates, CONC, async (tpl) => {
    const codigo = String(tpl.Pac_Codigo || "");
    if (!codigo) return;
    try {
      const qs = new URLSearchParams({
        codigo,
        pescodigo: "",
        draw: "1",
        start: "0",
        length: "5000",
        "search[value]": "",
        "search[regex]": "false",
      });
      const json = await fetchJson(
        request,
        `${SYSTEM_BASE}/pages/cadastros/buscaPacotePessoaInfov2.php?${qs}`
      );
      for (const row of json.data || []) {
        vendas.push(stripHtmlFields(row));
      }
    } catch (e) {
      console.warn(`  Infov2 fail ${codigo}:`, String(e.message || e).slice(0, 120));
    }
    doneTpl += 1;
    if (doneTpl % 20 === 0 || doneTpl === templates.length) {
      console.log(`  … templates ${doneTpl}/${templates.length} (vendas ${vendas.length})`);
    }
  });
  saveJson("pacotes-venda", vendas);

  const candidates = INCLUDE_EXHAUSTED
    ? vendas
    : vendas.filter((r) => toNum(r.PPa_Qtd_Usada) < toNum(r.PPa_Qtd_Sessao));
  console.log(
    `Detalhes (Utilizados) para ${candidates.length}/${vendas.length} vendas` +
      (INCLUDE_EXHAUSTED ? " (incl. esgotados)" : " com saldo)…")
  );

  const detalhes = [];
  let doneDet = 0;
  await mapPool(candidates, CONC, async (sale) => {
    const ppa = String(sale.PPa_Codigo || "");
    if (!ppa) return;
    try {
      const json = await fetchJson(
        request,
        `${SYSTEM_BASE}/pages/cadastros/buscaPessoaPacoteDetalhesv2.php?tipo=1&ppacodigo=${encodeURIComponent(ppa)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: "",
        }
      );
      const items = (json.data || []).map(stripHtmlFields);
      detalhes.push({
        PPa_Codigo: ppa,
        Pes_Codigo: sale.Pes_Codigo,
        Pac_Codigo: sale.Pac_Codigo,
        Pac_Descricao: sale.Pac_Descricao,
        PPa_Qtd_Sessao: sale.PPa_Qtd_Sessao,
        PPa_Qtd_Usada: sale.PPa_Qtd_Usada,
        PPa_Expiracao: sale.PPa_Expiracao,
        PPa_Dat_Cadastro: sale.PPa_Dat_Cadastro,
        PPa_Vlr_Venda: sale.PPa_Vlr_Venda,
        Pes_Nome: sale.Pes_Nome,
        items,
      });
    } catch (e) {
      if (doneDet % 100 === 0) {
        console.warn(`  detalhes fail ${ppa}:`, String(e.message || e).slice(0, 120));
      }
    }
    doneDet += 1;
    if (doneDet % 100 === 0 || doneDet === candidates.length) {
      console.log(`  … detalhes ${doneDet}/${candidates.length}`);
    }
  });
  saveJson("pacote-venda-detalhes", detalhes);

  const ativos = detalhes.filter((d) => {
    const rem = (d.items || []).reduce((acc, it) => {
      const total = toNum(it.PTe_Quantidade);
      const used = toNum(it.Utilizados);
      return acc + Math.max(0, total - used);
    }, 0);
    return rem > 0;
  });
  saveJson("pacotes-venda-ativos", ativos);

  saveJson("manifest", {
    exportedAt: new Date().toISOString(),
    source: SYSTEM_BASE.replace(/^https?:\/\//, ""),
    purpose: "carteiras de pacotes vendidos (client_packages)",
    templates: templates.length,
    vendas: vendas.length,
    comSaldoSessao: candidates.length,
    detalhes: detalhes.length,
    ativosComCredito: ativos.length,
    out: OUT,
  });

  console.log("OK →", OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
