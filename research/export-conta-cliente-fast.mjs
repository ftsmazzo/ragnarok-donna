/**
 * Export rápido Conta Cliente: totais + tabela ordenada por saldo + Excel se houver.
 * Sem varredura de 4k clientes.
 *
 * $env:APPBARBER_EMAIL=...; $env:APPBARBER_PASS=...; node research/export-conta-cliente-fast.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const EMAIL = process.env.APPBARBER_EMAIL ?? process.env.APPBELEZA_EMAIL;
const PASS = process.env.APPBARBER_PASS ?? process.env.APPBELEZA_PASS;
const SYSTEM_BASE = (
  process.env.APPBARBER_BASE_URL ?? "https://sistema.appbarber.com.br"
).replace(/\/$/, "");

if (!EMAIL || !PASS) {
  console.error("Defina APPBARBER_EMAIL/APPBARBER_PASS");
  process.exit(1);
}

const ROOT = path.resolve("research/export");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = path.join(ROOT, `${STAMP}-conta-cliente-fast`);
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

function stripBom(t) {
  return String(t || "").replace(/^\uFEFF/, "").trim();
}

async function dismiss(page) {
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) {
      try {
        await b.first().click({ timeout: 1200 });
      } catch {}
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const network = [];
  page.on("response", async (res) => {
    try {
      const url = res.url();
      if (!/conta|pessoa|cliente|saldo|fiado/i.test(url)) return;
      if (!/pages\//i.test(url)) return;
      const body = await res.text();
      network.push({ url, status: res.status(), body: body.slice(0, 1_000_000) });
    } catch {}
  });

  await page.goto(`${SYSTEM_BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await dismiss(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForTimeout(4000);
  await dismiss(page);

  await page.evaluate(() => {
    window.location.hash = "#/contacliente";
  });
  await page.waitForTimeout(4500);
  await dismiss(page);

  const pageText = await page.evaluate(() => document.body.innerText.slice(0, 25000));
  saveJson("page-text", { text: pageText });
  const tm = pageText.match(
    /Total em débito:\s*R\$\s*([-\d.,]+)[\s\S]*?Total com crédito:\s*R\$\s*([-\d.,]+)[\s\S]*?Total:\s*R\$\s*([-\d.,]+)/
  );
  const screenTotals = tm
    ? { debito: parseBRL(tm[1]), credito: parseBRL(tm[2]), total: parseBRL(tm[3]) }
    : null;
  console.log("Totais tela:", screenTotals);

  // Preferir endpoint de rede com aaData / result
  const fromNet = [];
  for (const hit of network) {
    try {
      const j = JSON.parse(stripBom(hit.body));
      const rows = j.aaData || j.data || j.result;
      if (!Array.isArray(rows) || !rows.length) continue;
      for (const row of rows) {
        if (Array.isArray(row)) {
          const name = String(row[0] || "").replace(/<[^>]+>/g, "").trim();
          const saldo = parseBRL(String(row[1] || "").replace(/<[^>]+>/g, ""));
          if (name && Math.abs(saldo) > 0.0001) fromNet.push({ name, saldo, source: hit.url });
        } else if (row && typeof row === "object") {
          const name = row.Pes_Nome || row.Nome || row.name;
          const saldo =
            row.saldoParsed ??
            Number(row.SaldoReal) ??
            parseBRL(row.PCo_Saldo || row.Saldo);
          if (name && Math.abs(saldo) > 0.0001)
            fromNet.push({ name: String(name).trim(), saldo, codigo: row.Pes_Codigo, source: hit.url });
        }
      }
    } catch {}
  }
  saveJson("network-nonzero", fromNet);
  saveJson("network-raw-urls", network.map((n) => ({ url: n.url, status: n.status, len: n.body.length })));

  // Ordenar Saldo e paginar só enquanto houver ≠0
  const lengthSelect = page.locator(".dataTables_length select").first();
  if (await lengthSelect.count()) {
    await lengthSelect.selectOption({ label: "100" }).catch(async () => {
      await lengthSelect.selectOption("100").catch(() => {});
    });
    await page.waitForTimeout(1200);
  }
  const saldoTh = page.locator("table thead th", { hasText: /^Saldo$/i }).first();
  if (await saldoTh.count()) {
    await saldoTh.click();
    await page.waitForTimeout(1200);
    await saldoTh.click();
    await page.waitForTimeout(1500);
  }

  // Extrair direto do DataTables (todas as linhas em memória)
  const dtRows = await page.evaluate(() => {
    const $ = window.jQuery || window.$;
    if (!$ || !$.fn?.dataTable || !$("#tabelaPessoaConta").length) return null;
    try {
      const dt = $("#tabelaPessoaConta").DataTable();
      const data = dt.rows({ search: "applied" }).data().toArray();
      return data.map((row) => {
        if (Array.isArray(row)) {
          return {
            name: String(row[0] || "").replace(/<[^>]+>/g, "").trim(),
            saldoRaw: String(row[1] || "").replace(/<[^>]+>/g, "").trim(),
          };
        }
        return {
          name: String(row.Pes_Nome || row.Nome || "").trim(),
          saldoRaw: String(row.PCo_Saldo || row.Saldo || row.SaldoReal || "").trim(),
          codigo: row.Pes_Codigo ? String(row.Pes_Codigo) : undefined,
        };
      });
    } catch (e) {
      return { error: String(e) };
    }
  });

  const tableRows = [];
  if (Array.isArray(dtRows)) {
    for (const r of dtRows) {
      const saldo = parseBRL(r.saldoRaw);
      if (Math.abs(saldo) > 0.0001) {
        tableRows.push({ name: r.name, saldoRaw: r.saldoRaw, saldo, codigo: r.codigo });
      }
    }
    console.log(`DataTables: ${dtRows.length} linhas, ≠0=${tableRows.length}`);
  } else {
    console.log("DataTables indisponível:", dtRows);
  }

  if (tableRows.length < 5) {
    await page.evaluate(() => {
      const $ = window.jQuery || window.$;
      if ($ && $.fn?.dataTable && $("#tabelaPessoaConta").length) {
        try {
          $("#tabelaPessoaConta").DataTable().page.len(-1).draw();
        } catch {}
      }
    });
    await page.waitForTimeout(2000);
    const batch = await page.evaluate(() => {
      const out = [];
      for (const tr of document.querySelectorAll("#tabelaPessoaConta tbody tr, table tbody tr")) {
        const tds = [...tr.querySelectorAll("td")].map((td) => td.innerText.trim());
        if (tds.length < 2) continue;
        if (/nenhum registro/i.test(tds[0])) continue;
        out.push({ name: tds[0], saldoRaw: tds[1] });
      }
      return out;
    });
    for (const r of batch) {
      const saldo = parseBRL(r.saldoRaw);
      if (Math.abs(saldo) > 0.0001) {
        tableRows.push({ name: r.name, saldoRaw: r.saldoRaw, saldo });
      }
    }
    console.log(`DOM fallback: ${batch.length} linhas, ≠0=${tableRows.length}`);
  }
  saveJson("contacliente-table-nonzero", tableRows);

  // Excel
  const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  const excelBtn = page.getByRole("link", { name: /Excel/i }).or(page.locator("a,button", { hasText: /^Excel$/i }));
  if (await excelBtn.count()) {
    await excelBtn.first().click().catch(() => {});
  }
  const dl = await downloadPromise;
  if (dl) {
    const dest = path.join(OUT, await dl.suggestedFilename());
    await dl.saveAs(dest);
    console.log("✓ excel", dest);
  }

  await page.screenshot({ path: path.join(OUT, "contacliente.png"), fullPage: true }).catch(() => {});

  const merged = [...tableRows];
  for (const r of fromNet) {
    if (!merged.some((m) => m.name === r.name && Math.abs(m.saldo - r.saldo) < 0.01)) {
      merged.push({ name: r.name, saldo: r.saldo, saldoRaw: String(r.saldo), codigo: r.codigo });
    }
  }

  saveJson("conta-cliente-saldos-nonzero", merged);
  saveJson("manifest", {
    exportedAt: new Date().toISOString(),
    screenTotals,
    tableNonzero: tableRows.length,
    networkNonzero: fromNet.length,
    merged: merged.length,
    tableDivida: merged.filter((r) => r.saldo < 0).reduce((a, r) => a + r.saldo, 0),
    tableCredito: merged.filter((r) => r.saldo > 0).reduce((a, r) => a + r.saldo, 0),
    out: OUT,
  });
  console.log("Merged ≠0:", merged.length, OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
