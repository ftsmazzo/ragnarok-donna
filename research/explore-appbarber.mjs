import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "https://sistema.appbarber.com.br/";
const EMAIL = "REDACTED_EMAIL";
const PASS = "REDACTED_PASSWORD";
const OUT = path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/appbarber-screenshots");
const NOTES = path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/appbarber-inventory.json");

fs.mkdirSync(OUT, { recursive: true });

const inventory = {
  startedAt: new Date().toISOString(),
  screens: [],
  menus: [],
  identity: {},
  pages: [],
  notes: [],
};

async function shot(page, name, note = "") {
  const file = path.join(OUT, `${String(inventory.screens.length + 1).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  inventory.screens.push({ name, file, url: page.url(), note });
  console.log(`SHOT ${name}`);
}

async function dismissOverlays(page) {
  // cookies
  for (const t of ["Aceitar tudo", "Aceitar"]) {
    const b = page.getByRole("button", { name: t });
    if (await b.count()) {
      try { await b.first().click({ timeout: 2000 }); await page.waitForTimeout(500); } catch {}
    }
  }
  // close notification toasts if any X buttons
  const closes = page.locator(".close, .toast .close, button.close, [aria-label='Close'], .btn-close");
  const n = await closes.count();
  for (let i = 0; i < Math.min(n, 6); i++) {
    try { await closes.nth(i).click({ timeout: 800 }); } catch {}
  }
}

async function login(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  await dismissOverlays(page);
  await page.locator("input[placeholder='E-mail']:visible, #email:visible").first().fill(EMAIL);
  await page.locator("input[type='password']:visible").first().fill(PASS);
  await page.locator("button:has-text('ACESSAR'), .btn:has-text('ACESSAR')").first().click();
  await page.waitForURL(/index\.php|#\/|agenda/i, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await dismissOverlays(page);
  // wait loading gone
  for (let i = 0; i < 20; i++) {
    const loading = page.locator("text=Carregando...");
    if (!(await loading.count()) || !(await loading.first().isVisible().catch(() => false))) break;
    await page.waitForTimeout(1000);
  }
  await dismissOverlays(page);
  await shot(page, "agenda-inicial", "Agenda apÃ³s login");
}

async function mapSidebar(page) {
  // Expand all treeviews
  for (let round = 0; round < 3; round++) {
    const parents = page.locator(".sidebar-menu > li.treeview > a, .nav-sidebar .nav-item > a, li.treeview > a");
    const count = await parents.count();
    for (let i = 0; i < count; i++) {
      try {
        const a = parents.nth(i);
        const li = a.locator("xpath=..");
        const cls = (await li.getAttribute("class")) || "";
        if (!cls.includes("active") && !cls.includes("menu-open")) {
          await a.click({ timeout: 1500 });
          await page.waitForTimeout(200);
        }
      } catch {}
    }
  }

  const items = await page.evaluate(() => {
    const out = [];
    const links = document.querySelectorAll(
      ".sidebar-menu a, .main-sidebar a, .nav-sidebar a, aside .sidebar a, .sidebar a"
    );
    for (const a of links) {
      const text = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!text || text.length > 80) continue;
      const href = a.getAttribute("href") || "";
      const rect = a.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      out.push({
        text,
        href,
        hasChildren: !!(a.parentElement && a.parentElement.querySelector("ul")),
      });
    }
    // unique by text+href
    const seen = new Set();
    return out.filter((i) => {
      const k = i.text + "|" + i.href;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

  inventory.menus = items;
  fs.writeFileSync(path.join(OUT, "sidebar-menu.json"), JSON.stringify(items, null, 2));
  return items;
}

async function clickMenuByText(page, text) {
  // Try exact then partial in sidebar
  const candidates = [
    page.locator(".sidebar-menu a, .main-sidebar a, .nav-sidebar a, aside a").filter({ hasText: new RegExp(`^${text}$`, "i") }),
    page.locator(".sidebar-menu a, .main-sidebar a, .nav-sidebar a, aside a").filter({ hasText: text }),
  ];
  for (const loc of candidates) {
    if (await loc.count()) {
      await loc.first().click({ timeout: 5000 });
      return true;
    }
  }
  // fallback: getByRole
  const role = page.getByRole("link", { name: text, exact: false });
  if (await role.count()) {
    await role.first().click({ timeout: 5000 });
    return true;
  }
  return false;
}

async function pageMeta(page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const header = document.querySelector(".main-header, .navbar, header");
    const sidebar = document.querySelector(".main-sidebar, .sidebar, aside");
    const hs = getComputedStyle(header || document.body);
    const ss = getComputedStyle(sidebar || document.body);
    const headings = [...document.querySelectorAll("h1,h2,h3,.content-header,.page-header")]
      .map((e) => (e.textContent || "").trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 10);
    const btns = [...document.querySelectorAll("button,.btn")]
      .map((e) => (e.textContent || "").trim().replace(/\s+/g, " "))
      .filter((t) => t && t.length < 40)
      .slice(0, 25);
    return {
      url: location.href,
      hash: location.hash,
      title: document.title,
      bodyBg: body.backgroundColor,
      bodyColor: body.color,
      font: body.fontFamily,
      headerBg: hs.backgroundColor,
      sidebarBg: ss.backgroundColor,
      headings,
      buttons: [...new Set(btns)],
      tableCount: document.querySelectorAll("table").length,
      formCount: document.querySelectorAll("form").length,
      textSample: (document.querySelector(".content-wrapper, .content, main, #app") || document.body)
        .innerText.slice(0, 600)
        .replace(/\s+/g, " "),
    };
  });
}

const TARGETS = [
  // top-level groups to open first
  { open: "Cadastros" },
  { click: "Clientes", name: "cadastros-clientes" },
  { click: "Profissionais", name: "cadastros-profissionais" },
  { click: "ServiÃ§os", name: "cadastros-servicos" },
  { click: "Meus Pacotes", name: "cadastros-pacotes" },
  { click: "Produtos", name: "cadastros-produtos" },
  { open: "Comandas" },
  { click: "Abertas", name: "comandas-abertas" },
  { click: "HistÃ³rico de Comandas", name: "comandas-historico" },
  { open: "Financeiro" },
  { click: "Caixa", name: "financeiro-caixa" },
  { click: "ComissÃµes", name: "financeiro-comissoes" },
  { click: "Fluxo de Caixa", name: "financeiro-fluxo" },
  { open: "RelatÃ³rios" },
  { click: "Geral", name: "relatorios-geral" },
  { click: "Financeiro", name: "relatorios-financeiro" },
  { open: "ConfiguraÃ§Ãµes" },
  { click: "ParÃ¢metros", name: "config-parametros" },
  { click: "Lista de Espera", name: "config-lista-espera" },
  { click: "Funcionamento", name: "config-funcionamento" },
  { click: "RodÃ­zio de Profissionais", name: "config-rodizio" },
  { click: "Agenda", name: "agenda-volta" },
  { open: "Cadastros" },
  { click: "Clube de Clientes", name: "cadastros-clube" },
  { click: "Planos de Assinatura", name: "cadastros-assinaturas" },
  { click: "Pesquisa de SatisfaÃ§Ã£o", name: "cadastros-pesquisa" },
  { click: "Mensagens p/ UsuÃ¡rios", name: "cadastros-mensagens" },
];

async function exploreByClicks(page) {
  await mapSidebar(page);
  await shot(page, "sidebar-expandida", "Menu completo");

  const identity = await pageMeta(page);
  inventory.identity = identity;

  for (const step of TARGETS) {
    try {
      if (step.open) {
        await clickMenuByText(page, step.open);
        await page.waitForTimeout(400);
        continue;
      }
      const ok = await clickMenuByText(page, step.click);
      if (!ok) {
        inventory.notes.push({ type: "miss", click: step.click });
        console.log("MISS", step.click);
        continue;
      }
      await page.waitForTimeout(2500);
      await dismissOverlays(page);
      // wait loading
      for (let i = 0; i < 12; i++) {
        const loading = page.locator("text=Carregando...");
        if (!(await loading.count()) || !(await loading.first().isVisible().catch(() => false))) break;
        await page.waitForTimeout(800);
      }
      const meta = await pageMeta(page);
      await shot(page, step.name, step.click);
      inventory.pages.push({ name: step.name, label: step.click, ...meta });
      console.log("OK", step.click, meta.hash || meta.url);
    } catch (e) {
      inventory.notes.push({ type: "error", step, message: String(e).slice(0, 250) });
      console.log("ERR", step.click || step.open, e.message);
    }
  }

  // Capture week and month views if buttons exist
  for (const view of ["Semana", "MÃªs", "Dia"]) {
    try {
      await clickMenuByText(page, "Agenda");
      await page.waitForTimeout(1500);
      const btn = page.getByRole("button", { name: view }).or(page.locator(`a:has-text('${view}'), button:has-text('${view}'), .btn:has-text('${view}')`));
      if (await btn.count()) {
        await btn.first().click();
        await page.waitForTimeout(2000);
        await shot(page, `agenda-view-${view.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`, `Agenda ${view}`);
      }
    } catch {}
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);

  try {
    await login(page);
    if (page.url().includes("login")) {
      inventory.notes.push({ type: "login-failed" });
    } else {
      await exploreByClicks(page);
    }
  } catch (e) {
    inventory.notes.push({ type: "fatal", message: String(e) });
    await shot(page, "fatal", String(e)).catch(() => {});
  } finally {
    inventory.finishedAt = new Date().toISOString();
    fs.writeFileSync(NOTES, JSON.stringify(inventory, null, 2));
    // also a human markdown summary skeleton
    const md = [];
    md.push("# InventÃ¡rio AppBarber (RagnaroKS)");
    md.push("");
    md.push(`Gerado: ${inventory.finishedAt}`);
    md.push("");
    md.push("## Identidade (home)");
    md.push("```json");
    md.push(JSON.stringify(inventory.identity, null, 2));
    md.push("```");
    md.push("");
    md.push("## Menu lateral");
    for (const m of inventory.menus || []) md.push(`- ${m.text} â†’ \`${m.href}\``);
    md.push("");
    md.push("## Telas visitadas");
    for (const p of inventory.pages || []) {
      md.push(`### ${p.label}`);
      md.push(`- hash/url: ${p.hash || p.url}`);
      md.push(`- headings: ${(p.headings || []).join(" | ")}`);
      md.push(`- sample: ${(p.textSample || "").slice(0, 280)}`);
      md.push("");
    }
    fs.writeFileSync(
      path.resolve("C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/APPBARBER-INVENTARIO.md"),
      md.join("\n")
    );
    await browser.close();
    console.log("DONE");
  }
}

main();

