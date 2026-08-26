/**
 * Exportador de dados do próprio estabelecimento no AppBarber (migração).
 * Uso:
 *   $env:APPBARBER_EMAIL="..."; $env:APPBARBER_PASS="..."; node export-appbarber.mjs
 *
 * Saída: research/export/<timestamp>/
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = process.env.APPBARBER_EMAIL;
const PASS = process.env.APPBARBER_PASS;
if (!EMAIL || !PASS) {
  console.error("Defina APPBARBER_EMAIL e APPBARBER_PASS");
  process.exit(1);
}

const ROOT = path.resolve(
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export"
);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(ROOT, STAMP);
fs.mkdirSync(OUT, { recursive: true });

function saveJson(name, data) {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`✓ ${name}.json (${Array.isArray(data) ? data.length : typeof data} registros/objeto)`);
  return file;
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
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(";")];
  for (const row of rows) lines.push(keys.map((k) => esc(row[k])).join(";"));
  fs.writeFileSync(path.join(OUT, fileName), "\uFEFF" + lines.join("\n"), "utf8");
  console.log(`✓ ${fileName} (${rows.length} linhas)`);
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
  await page.goto("https://sistema.appbarber.com.br/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(5000);
  await dismiss(page);
  if (page.url().includes("login")) throw new Error("Login falhou");
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

async function fetchJson(request, url, options = {}) {
  const res = await request.fetch(url, {
    ...options,
    timeout: 120000,
  });
  const text = (await res.text()).replace(/^\uFEFF/, "").trim();
  if (!res.ok()) {
    throw new Error(`${res.status()} ${url} → ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON inválido em ${url}: ${text.slice(0, 200)}`);
  }
}

/** DataTables: pagina até esvaziar */
async function fetchDataTableAll(request, baseUrl, { method = "GET", form = {}, pageSize = 500 } = {}) {
  const all = [];
  let start = 0;
  let draw = 1;
  let total = Infinity;

  while (start < total) {
    const params = new URLSearchParams();
    params.set("draw", String(draw));
    params.set("start", String(start));
    params.set("length", String(pageSize));
    params.set("search[value]", "");
    params.set("search[regex]", "false");

    let json;
    if (method === "GET") {
      const sep = baseUrl.includes("?") ? "&" : "?";
      json = await fetchJson(request, `${baseUrl}${sep}${params.toString()}`);
    } else {
      const body = new URLSearchParams({ ...form, ...Object.fromEntries(params) });
      json = await fetchJson(request, baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: body.toString(),
      });
    }

    const chunk = (json.data || []).map(stripHtmlFields);
    total = Number(json.recordsTotal ?? json.recordsFiltered ?? chunk.length);
    all.push(...chunk);
    console.log(`  … ${baseUrl.split("/").pop()} ${all.length}/${total}`);
    if (!chunk.length) break;
    start += pageSize;
    draw += 1;
    await new Promise((r) => setTimeout(r, 200));
  }
  return all;
}

function parseBrDate(d) {
  // dd/mm/yyyy
  const [dd, mm, yyyy] = d.split("/").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function formatBrDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function exportAgendaRange(request, profissionais, from, to) {
  const all = [];
  const byId = Object.fromEntries(
    profissionais.filter((p) => p.Pes_Codigo).map((p) => [p.Pes_Codigo, p])
  );
  const ids = Object.keys(byId);
  const cursor = new Date(from);
  while (cursor <= to) {
    const dia = formatBrDate(cursor);
    const body = new URLSearchParams();
    for (const id of ids) body.append("profissional[]", id);
    body.set("tipo", "1");
    body.set("dia", dia);
    try {
      const json = await fetchJson(
        request,
        "https://sistema.appbarber.com.br/pages/actions/buscaAgenda3.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: body.toString(),
        }
      );
      const rows = Array.isArray(json) ? json : json?.result || [];
      for (const r of rows) {
        const id = String(r.resources || r.profissionalId || "");
        const p = byId[id];
        all.push({
          ...r,
          profissionalId: id,
          profissionalNome: p?.Pes_Nome || p?.Pes_Apelido || "",
        });
      }
    } catch (e) {
      console.warn(`  agenda fail ${dia}:`, e.message);
    }
    if (cursor.getDate() === 1) console.log(`  agenda mês ${formatBrDate(cursor)}… total ${all.length}`);
    cursor.setDate(cursor.getDate() + 1);
    await new Promise((r) => setTimeout(r, 40));
  }
  return all;
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function exportComandaItens(request, comandaCodigos) {
  const all = [];
  let done = 0;
  const conc = Number(process.env.APPBARBER_ITEM_CONCURRENCY || 6);
  await mapPool(comandaCodigos, conc, async (codigo) => {
    try {
      const json = await fetchJson(
        request,
        `https://sistema.appbarber.com.br/pages/cadastros/buscaItensComanda.php?codigo=${encodeURIComponent(codigo)}`
      );
      const rows = (json.data || []).map(stripHtmlFields);
      for (const r of rows) all.push({ ...r, ComandaCodigo: codigo });
    } catch (e) {
      if (done % 200 === 0) console.warn(`  item fail ${codigo}:`, e.message.slice(0, 120));
    }
    done += 1;
    if (done % 200 === 0) console.log(`  … itens comandas ${done}/${comandaCodigos.length} (linhas ${all.length})`);
  });
  return all;
}

async function main() {
  const manifest = {
    exportedAt: new Date().toISOString(),
    source: "sistema.appbarber.com.br",
    purpose: "migração de dados do estabelecimento (cliente autorizado)",
    files: [],
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
  });
  const page = await context.newPage();
  const request = context.request;

  console.log("Login…");
  await login(page);

  // --- Cadastros estáticos ---
  console.log("Profissionais…");
  const profJson = await fetchJson(
    request,
    "https://sistema.appbarber.com.br/pages/cadastros/buscaProfissionais.php"
  );
  const profissionais = profJson.profissionais || profJson.data || [];
  saveJson("profissionais", profissionais);
  toCsv(profissionais, "profissionais.csv");
  manifest.files.push("profissionais");

  console.log("Serviços…");
  const servJson = await fetchJson(
    request,
    "https://sistema.appbarber.com.br/pages/cadastros/buscaServicosv2.php"
  );
  const servicos = (servJson.data || []).map(stripHtmlFields);
  saveJson("servicos", servicos);
  toCsv(servicos, "servicos.csv");
  manifest.files.push("servicos");

  console.log("Produtos…");
  const produtos = await fetchDataTableAll(
    request,
    "https://sistema.appbarber.com.br/pages/cadastros/buscaProdutos.php?disponivelVenda=0",
    { method: "GET", pageSize: 200 }
  );
  saveJson("produtos", produtos);
  toCsv(produtos, "produtos.csv");
  manifest.files.push("produtos");

  console.log("Pacotes…");
  const pacotes = await fetchDataTableAll(
    request,
    "https://sistema.appbarber.com.br/pages/cadastros/buscaPacotes.php",
    { method: "POST", form: { disponivel: "" }, pageSize: 200 }
  );
  saveJson("pacotes", pacotes);
  toCsv(pacotes, "pacotes.csv");
  manifest.files.push("pacotes");

  console.log("Clientes (ativos)…");
  const clientes = await fetchDataTableAll(
    request,
    "https://sistema.appbarber.com.br/pages/cadastros/buscaClientes_v4.php",
    { method: "GET", pageSize: 500 }
  );
  saveJson("clientes", clientes);
  toCsv(clientes, "clientes.csv");
  manifest.files.push("clientes");

  console.log("Clientes removidos…");
  try {
    const remJson = await fetchJson(
      request,
      "https://sistema.appbarber.com.br/pages/cadastros/buscaClientesRemovidos.php?tipo=1"
    );
    const removidos = (remJson.data || []).map(stripHtmlFields);
    saveJson("clientes-removidos", removidos);
    toCsv(removidos, "clientes-removidos.csv");
    manifest.files.push("clientes-removidos");
  } catch (e) {
    console.warn("clientes removidos:", e.message);
  }

  console.log("Jornadas (amostra por profissional, dia da semana 1–7)…");
  const jornadas = [];
  for (const p of profissionais) {
    for (let dia = 0; dia <= 6; dia++) {
      const body = new URLSearchParams({
        dia: String(dia),
        profissional: p.Pes_Codigo,
        dataAgenda: formatBrDate(new Date()),
      });
      try {
        const j = await fetchJson(
          request,
          "https://sistema.appbarber.com.br/pages/actions/buscaJornadaProfissionais.php",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: body.toString(),
          }
        );
        for (const row of j.jornada || []) jornadas.push(row);
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  saveJson("jornadas", jornadas);
  toCsv(jornadas, "jornadas.csv");
  manifest.files.push("jornadas");

  // Agenda/comandas: padrão 24 meses atrás + 60 dias à frente
  const daysBack = Number(process.env.APPBARBER_AGENDA_DAYS_BACK || 730);
  const daysFwd = Number(process.env.APPBARBER_AGENDA_DAYS_FWD || 60);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - daysBack);
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + daysFwd);

  console.log(
    `Agenda ${formatBrDate(from)} → ${formatBrDate(to)} (${profissionais.length} profissionais)…`
  );
  const agenda = await exportAgendaRange(request, profissionais, from, to);
  saveJson("agenda", agenda);
  toCsv(agenda, "agenda.csv");
  manifest.files.push("agenda");

  // Comandas histórico (mesmo período aproximado, em fatias de 7 dias)
  console.log("Comandas histórico…");
  const comandas = [];
  const cCursor = new Date(from);
  while (cCursor <= to) {
    const ini = new Date(cCursor);
    const fim = new Date(cCursor);
    fim.setDate(fim.getDate() + 6);
    if (fim > to) fim.setTime(to.getTime());
    const body = new URLSearchParams({
      tipo: "1",
      dataini: formatBrDate(ini),
      datafim: formatBrDate(fim),
      comanda: "",
    });
    try {
      const json = await fetchJson(
        request,
        "https://sistema.appbarber.com.br/pages/cadastros/buscaComandasHistoricov2.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: body.toString(),
        }
      );
      // endpoint may ignore length — take data and also paginate if recordsTotal large
      let chunk = (json.data || []).map(stripHtmlFields);
      const total = Number(json.recordsTotal || chunk.length);
      if (total > chunk.length && chunk.length > 0) {
        // re-fetch with DataTables paging for this window
        chunk = await fetchDataTableAll(
          request,
          "https://sistema.appbarber.com.br/pages/cadastros/buscaComandasHistoricov2.php",
          {
            method: "POST",
            form: {
              tipo: "1",
              dataini: formatBrDate(ini),
              datafim: formatBrDate(fim),
              comanda: "",
            },
            pageSize: 200,
          }
        );
      }
      comandas.push(...chunk);
      console.log(`  comandas ${formatBrDate(ini)}–${formatBrDate(fim)} → +${chunk.length} (acc ${comandas.length})`);
    } catch (e) {
      console.warn("  comandas:", e.message);
    }
    cCursor.setDate(cCursor.getDate() + 7);
    await new Promise((r) => setTimeout(r, 150));
  }
  // dedupe by Codigo
  const seen = new Set();
  const comandasUniq = comandas.filter((c) => {
    const id = c.Codigo;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  saveJson("comandas-historico", comandasUniq);
  toCsv(comandasUniq, "comandas-historico.csv");
  manifest.files.push("comandas-historico");

  const comandaIds = comandasUniq.map((c) => c.Codigo).filter(Boolean);
  console.log(`Itens de comanda (${comandaIds.length} comandas)…`);
  const itens = await exportComandaItens(request, comandaIds);
  saveJson("comanda-itens", itens);
  toCsv(itens, "comanda-itens.csv");
  manifest.files.push("comanda-itens");

  manifest.counts = {
    profissionais: profissionais.length,
    servicos: servicos.length,
    produtos: produtos.length,
    pacotes: pacotes.length,
    clientes: clientes.length,
    jornadas: jornadas.length,
    agenda: agenda.length,
    comandas: comandasUniq.length,
    comandaItens: itens.length,
  };
  manifest.agendaRange = { from: formatBrDate(from), to: formatBrDate(to) };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\nConcluído:", OUT);
  console.log(manifest.counts);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
