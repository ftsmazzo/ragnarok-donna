import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = process.env.APPBARBER_EMAIL;
const PASS = process.env.APPBARBER_PASS;
if (!EMAIL || !PASS) {
  console.error("Defina APPBARBER_EMAIL e APPBARBER_PASS");
  process.exit(1);
}

const EXPORT_SRC =
  process.env.APPBARBER_EXPORT_DIR ||
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export/2026-08-26T14-56-45";
const ROOT = path.resolve(
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export"
);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(ROOT, `${STAMP}-extras`);
fs.mkdirSync(OUT, { recursive: true });

const BASE = "https://sistema.appbarber.com.br";
const CONC = Number(process.env.APPBARBER_ITEM_CONCURRENCY || 8);

function saveJson(name, data) {
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
  const n = Array.isArray(data) ? data.length : Object.keys(data || {}).length;
  console.log(`✓ ${name}.json (${n})`);
}

function toCsv(rows, fileName) {
  if (!rows?.length) {
    fs.writeFileSync(path.join(OUT, fileName), "");
    return;
  }
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
    (k) => !/^btn/i.test(k) && k !== "DT_RowId"
  );
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [keys.join(";")];
  for (const row of rows) lines.push(keys.map((k) => esc(row[k])).join(";"));
  fs.writeFileSync(path.join(OUT, fileName), "\uFEFF" + lines.join("\n"), "utf8");
  console.log(`✓ ${fileName} (${rows.length})`);
}

function stripHtml(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (/^btn/i.test(k) || k === "DT_RowId") continue;
    out[k] =
      typeof v === "string" && v.includes("<")
        ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : v;
  }
  return out;
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

async function fetchJson(request, url, options = {}) {
  const res = await request.fetch(url, { ...options, timeout: 120000 });
  const text = (await res.text()).replace(/^\uFEFF/, "").trim();
  if (!res.ok()) throw new Error(`${res.status()} ${url} → ${text.slice(0, 180)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON inválido ${url}: ${text.slice(0, 180)}`);
  }
}

async function postForm(request, pathName, form = {}) {
  const body = new URLSearchParams(form);
  return fetchJson(request, `${BASE}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: body.toString(),
  });
}

async function getJson(request, pathName) {
  return fetchJson(request, `${BASE}${pathName}`);
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
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker())
  );
  return out;
}

function formatBrDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

async function main() {
  const clientes = JSON.parse(fs.readFileSync(path.join(EXPORT_SRC, "clientes.json"), "utf8"));
  const pacotes = JSON.parse(fs.readFileSync(path.join(EXPORT_SRC, "pacotes.json"), "utf8"));
  const clientIds = clientes.map((c) => c.Codigo).filter(Boolean);
  const packageIds = pacotes.map((p) => p.Codigo).filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();
  const request = context.request;

  console.log("Login…");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(4500);
  if (page.url().includes("login")) throw new Error("Login falhou");

  const stats = {};

  // ---- Catálogos / config ----
  console.log("Catálogo de pontos (itens resgatáveis)…");
  try {
    const j = await postForm(request, "/pages/cadastros/buscaListaPontoItens.php", {});
    const rows = (j.buscaListaPontosItens || j.data || []).map(stripHtml);
    saveJson("fidelidade-itens", rows);
    toCsv(rows, "fidelidade-itens.csv");
    stats.fidelidadeItens = rows.length;
  } catch (e) {
    console.warn(e.message);
  }

  console.log("Clubes de clientes…");
  let clubes = [];
  try {
    const j = await getJson(request, "/pages/cadastros/buscaClubeCliente.php");
    clubes = (j.data || []).map(stripHtml);
    saveJson("clubes", clubes);
    toCsv(clubes, "clubes.csv");
    stats.clubes = clubes.length;
  } catch (e) {
    console.warn(e.message);
  }

  console.log("Serviços/produtos/membros por clube…");
  const clubeServicos = [];
  const clubeProdutos = [];
  const clubeMembros = [];
  for (const c of clubes) {
    const gru = c.Gru_Codigo;
    if (!gru) continue;
    try {
      const s = await postForm(request, "/pages/cadastros/buscaServicoGrupo.php", {
        grucodigo: gru,
        codigo: gru,
      });
      for (const r of s.data || []) clubeServicos.push({ ...stripHtml(r), Gru_Codigo: gru });
    } catch {}
    try {
      const p = await postForm(request, "/pages/cadastros/buscaProdutoGrupo.php", {
        grucodigo: gru,
        codigo: gru,
      });
      for (const r of p.data || []) clubeProdutos.push({ ...stripHtml(r), Gru_Codigo: gru });
    } catch {}
    try {
      const m = await postForm(request, "/pages/cadastros/buscaPessoaGrupo.php", {
        grucodigo: gru,
        codigo: gru,
      });
      for (const r of m.data || []) clubeMembros.push({ ...stripHtml(r), Gru_Codigo: gru });
    } catch {}
  }
  saveJson("clube-servicos", clubeServicos);
  toCsv(clubeServicos, "clube-servicos.csv");
  saveJson("clube-produtos", clubeProdutos);
  toCsv(clubeProdutos, "clube-produtos.csv");
  saveJson("clube-membros", clubeMembros);
  toCsv(clubeMembros, "clube-membros.csv");
  stats.clubeServicos = clubeServicos.length;
  stats.clubeProdutos = clubeProdutos.length;
  stats.clubeMembros = clubeMembros.length;

  console.log("Itens dos pacotes…");
  const pacoteItens = [];
  await mapPool(packageIds, CONC, async (codigo) => {
    try {
      const j = await getJson(
        request,
        `/pages/cadastros/buscaPacoteItens.php?codigo=${encodeURIComponent(codigo)}`
      );
      for (const r of j.data || []) pacoteItens.push({ ...stripHtml(r), PacoteCodigo: codigo });
    } catch {}
  });
  saveJson("pacote-itens", pacoteItens);
  toCsv(pacoteItens, "pacote-itens.csv");
  stats.pacoteItens = pacoteItens.length;

  console.log("Formulários de anamnese…");
  try {
    const j = await postForm(request, "/pages/cadastros/buscaFormularioAnamnese.php", {});
    const rows = (Array.isArray(j.data) ? j.data : j.data ? [j.data] : j.result || []).map(
      stripHtml
    );
    saveJson("anamnese-formularios", rows);
    toCsv(rows, "anamnese-formularios.csv");
    stats.anamneseFormularios = rows.length;
  } catch (e) {
    console.warn("anamnese form:", e.message);
  }

  console.log("Categorias receita/despesa…");
  try {
    const r = await postForm(request, "/pages/cadastros/buscaReceita.php", {});
    const rows = (r.data || r.buscaReceita || []).map(stripHtml);
    saveJson("financeiro-receitas", rows);
    toCsv(rows, "financeiro-receitas.csv");
    stats.receitas = rows.length;
  } catch (e) {
    console.warn(e.message);
  }
  try {
    const r = await postForm(request, "/pages/cadastros/buscaDespesa.php", {});
    const rows = (r.data || r.buscaDespesa || []).map(stripHtml);
    saveJson("financeiro-despesas", rows);
    toCsv(rows, "financeiro-despesas.csv");
    stats.despesas = rows.length;
  } catch (e) {
    console.warn(e.message);
  }

  console.log("Parâmetros…");
  try {
    const j = await postForm(request, "/pages/actions/buscaParametro.php", {});
    saveJson("parametros", j);
    stats.parametros = 1;
  } catch (e) {
    try {
      const j = await getJson(request, "/pages/cadastros/buscaParametroPessoa_v2.php?tipo=1");
      saveJson("parametros-pessoa", j);
    } catch (e2) {
      console.warn(e.message, e2.message);
    }
  }

  console.log("Lista de espera (24 meses)…");
  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 2);
    const j = await postForm(request, "/pages/cadastros/buscaListaEspera.php", {
      dataIni: formatBrDate(from),
      dataFim: formatBrDate(new Date()),
    });
    const rows = (j.data || []).map(stripHtml);
    saveJson("lista-espera", rows);
    toCsv(rows, "lista-espera.csv");
    stats.listaEspera = rows.length;
  } catch (e) {
    console.warn(e.message);
  }

  console.log("Notícias/promoções…");
  try {
    const j = await getJson(request, "/pages/cadastros/buscaNoticias.php");
    const rows = Array.isArray(j.data) ? j.data.map(stripHtml) : [];
    saveJson("noticias", rows);
    toCsv(rows, "noticias.csv");
    stats.noticias = rows.length;
  } catch (e) {
    console.warn(e.message);
  }

  // ---- Caixa histórico (por janelas) ----
  console.log("Caixas (histórico financeiro)…");
  const caixas = [];
  const movs = [];
  const cursor = new Date();
  cursor.setFullYear(cursor.getFullYear() - 2);
  cursor.setDate(1);
  const end = new Date();
  while (cursor <= end) {
    const ini = formatBrDate(cursor);
    const fimDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const fim = formatBrDate(fimDate > end ? end : fimDate);
    try {
      // tenta endpoints comuns
      let j;
      try {
        j = await postForm(request, "/pages/cadastros/buscaFinanceiroCaixav2.php", {
          dataini: ini,
          datafim: fim,
        });
      } catch {
        j = await postForm(request, "/pages/cadastros/buscaFinanceiroCaixa.php", {
          dataini: ini,
          datafim: fim,
        });
      }
      const rows = (j.data || j.buscaFinanceiroCaixa || []).map(stripHtml);
      for (const r of rows) {
        caixas.push({ ...r, _periodoIni: ini, _periodoFim: fim });
        const fca = r.Codigo || r.FCa_Codigo || r.FCaCodigo;
        if (fca) {
          try {
            const m = await postForm(
              request,
              "/pages/cadastros/buscaFinanceiroCaixaMovimentacaoRelacionado.php",
              { fcacodigo: fca, codigo: fca }
            );
            for (const mr of m.data || []) {
              movs.push({ ...stripHtml(mr), FCa_Codigo: fca });
            }
          } catch {}
        }
      }
      console.log(`  caixa ${ini}–${fim} → ${rows.length} (acc ${caixas.length})`);
    } catch (e) {
      console.warn(`  caixa ${ini}:`, e.message.slice(0, 120));
    }
    cursor.setMonth(cursor.getMonth() + 1);
    await new Promise((r) => setTimeout(r, 100));
  }
  // dedupe caixas
  const seenCaixa = new Set();
  const caixasUniq = caixas.filter((c) => {
    const id = c.Codigo || c.FCa_Codigo || c.FCaCodigo || JSON.stringify(c);
    if (seenCaixa.has(id)) return false;
    seenCaixa.add(id);
    return true;
  });
  saveJson("caixas", caixasUniq);
  toCsv(caixasUniq, "caixas.csv");
  saveJson("caixa-movimentacoes", movs);
  toCsv(movs, "caixa-movimentacoes.csv");
  stats.caixas = caixasUniq.length;
  stats.caixaMovimentacoes = movs.length;

  // ---- Por cliente: tags, serviços preferidos, anamnese ----
  console.log(`Tags por cliente (${clientIds.length})…`);
  const tags = [];
  let done = 0;
  await mapPool(clientIds, CONC, async (codigo) => {
    try {
      const j = await postForm(request, "/pages/cadastros/buscaClienteTag.php", {
        pescodigo: codigo,
      });
      for (const r of j.data || []) tags.push({ ...stripHtml(r), ClienteCodigo: codigo });
    } catch {}
    done++;
    if (done % 500 === 0) console.log(`  … tags ${done}/${clientIds.length} (linhas ${tags.length})`);
  });
  saveJson("cliente-tags", tags);
  toCsv(tags, "cliente-tags.csv");
  stats.clienteTags = tags.length;

  console.log(`Serviços preferidos / vínculos cliente (${clientIds.length})…`);
  const cliServicos = [];
  done = 0;
  await mapPool(clientIds, CONC, async (codigo) => {
    try {
      const j = await postForm(request, "/pages/cadastros/buscaPessoaServicoCliente.php", {
        pescodigo: codigo,
        tipo: "1",
      });
      const rows = j.data || [];
      if (Array.isArray(rows) && !(rows[0] && rows[0].erro)) {
        for (const r of rows) cliServicos.push({ ...stripHtml(r), ClienteCodigo: codigo });
      }
    } catch {}
    done++;
    if (done % 500 === 0)
      console.log(`  … cli-servicos ${done}/${clientIds.length} (linhas ${cliServicos.length})`);
  });
  saveJson("cliente-servicos", cliServicos);
  toCsv(cliServicos, "cliente-servicos.csv");
  stats.clienteServicos = cliServicos.length;

  console.log(`Anamneses por cliente (${clientIds.length})…`);
  const anamneses = [];
  done = 0;
  await mapPool(clientIds, CONC, async (codigo) => {
    try {
      const j = await postForm(request, "/pages/cadastros/buscaPessoaAnamnese.php", {
        pescodigo: codigo,
        codigo,
      });
      const rows = j.data || j.result || [];
      if (Array.isArray(rows) && !(rows[0] && rows[0].erro)) {
        for (const r of rows) anamneses.push({ ...stripHtml(r), ClienteCodigo: codigo });
      }
    } catch {}
    done++;
    if (done % 500 === 0)
      console.log(`  … anamnese ${done}/${clientIds.length} (linhas ${anamneses.length})`);
  });
  saveJson("cliente-anamneses", anamneses);
  toCsv(anamneses, "cliente-anamneses.csv");
  stats.clienteAnamneses = anamneses.length;

  // Pacotes vendidos (se endpoint existir)
  console.log("Vendas de pacotes…");
  try {
    await page.goto(`${BASE}/index.php#/pacotesVenda`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    // tenta endpoints tipicos
    for (const ep of [
      ["/pages/cadastros/buscaPacotesVenda.php", { tipo: "1" }],
      ["/pages/cadastros/buscaPacoteVenda.php", {}],
      ["/pages/cadastros/buscaPacotesPessoa.php", {}],
    ]) {
      try {
        const j = await postForm(request, ep[0], ep[1]);
        const rows = (j.data || []).map(stripHtml);
        if (rows.length) {
          saveJson("pacotes-venda", rows);
          toCsv(rows, "pacotes-venda.csv");
          stats.pacotesVenda = rows.length;
          break;
        }
      } catch {}
    }
  } catch (e) {
    console.warn(e.message);
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    sourceExport: EXPORT_SRC,
    purpose: "extras AppBarber (fidelidade, clubes, tags, anamnese, caixa, pacotes…)",
    stats,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\nConcluído:", OUT);
  console.log(stats);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
