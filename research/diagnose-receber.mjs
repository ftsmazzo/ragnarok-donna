/**
 * Diagnóstico: "a receber" vs pacotes/comandas valor 0 vs cartão crédito.
 * Uso: node research/diagnose-receber.mjs
 */
import fs from "fs";
import path from "path";

const EXPORT =
  process.env.APPBARBER_EXPORT ||
  "C:/Users/anjo_/OneDrive/Projetos-FabriaIA/app-barbearia/research/export/2026-09-13T12-25-22";

function parseBRL(v) {
  if (v == null) return 0;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}

const rows = JSON.parse(fs.readFileSync(path.join(EXPORT, "comandas-historico.json"), "utf8"));
const itemsPath = path.join(EXPORT, "comanda-itens.json");
const items = fs.existsSync(itemsPath)
  ? JSON.parse(fs.readFileSync(itemsPath, "utf8"))
  : [];

const byOrderItems = new Map();
for (const it of items) {
  const cod = String(it.Codigo ?? it.Com_Codigo ?? "");
  if (!cod) continue;
  if (!byOrderItems.has(cod)) byOrderItems.set(cod, []);
  byOrderItems.get(cod).push(it);
}

function looksLikePackage(order) {
  const list = byOrderItems.get(String(order.Codigo)) || [];
  const blob = [
    order.Obs,
    order.Observacao,
    ...list.map((i) => `${i.Item || ""} ${i.TipoItem || ""} ${i.Descricao || ""}`),
  ]
    .join(" ")
    .toLowerCase();
  return /pacote|crédito|credito|assinatura|recorr/.test(blob);
}

const open = rows.filter((r) => String(r.Status) === "Aberta");
const closed0 = rows.filter((r) => String(r.Status) === "Fechada" && parseBRL(r.Valor) === 0);
const credit = rows.filter(
  (r) => String(r.Status) === "Fechada" && /cr[eé]dito/i.test(String(r.TipoPagamento || ""))
);

let sumOpen = 0;
let sumOpenPkg = 0;
let openPkg = 0;
for (const r of open) {
  const v = parseBRL(r.Valor);
  sumOpen += v;
  if (looksLikePackage(r) || v === 0) {
    openPkg += 1;
    sumOpenPkg += v;
  }
}

let sumCredit = 0;
for (const r of credit) sumCredit += parseBRL(r.Valor);

let closed0Pkg = 0;
for (const r of closed0) if (looksLikePackage(r)) closed0Pkg += 1;

const out = {
  export: EXPORT,
  openOrders: { count: open.length, sumValor: Number(sumOpen.toFixed(2)) },
  openLikelyPackageOrZero: {
    count: openPkg,
    sumValor: Number(sumOpenPkg.toFixed(2)),
  },
  closedValorZero: { count: closed0.length, packageLike: closed0Pkg },
  closedCreditCardLike: {
    count: credit.length,
    sumValor: Number(sumCredit.toFixed(2)),
    note: "No nosso /contas, 'A receber (crédito)' soma payments.method=credit do período — NÃO é fiado/a receber real.",
  },
  conclusion: [
    "O card Contas → A receber hoje = vendas no cartão de crédito (já pagas no PDV), não dívida de cliente.",
    "Comandas Fechada com Valor 0,00 são típicas de consumo de pacote / cortesia — não são a receber.",
    "Comandas Aberta com valor > 0 são o único 'em aberto' operacional da comanda; conferir se ainda existem no AppBarber.",
  ],
};

const dest = path.join(EXPORT, "diagnose-receber.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log("wrote", dest);
