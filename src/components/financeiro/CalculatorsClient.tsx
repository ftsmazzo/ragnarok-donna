"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { calcBreakEven, calcWorkingCapital } from "@/server/treasury/calculators";

function reaisToCents(v: string) {
  return Math.round(Number(String(v).replace(",", ".") || 0) * 100);
}

export function CalculatorsClient() {
  const [inv, setInv] = useState("50000");
  const [recvDays, setRecvDays] = useState("15");
  const [payDays, setPayDays] = useState("30");
  const [sales, setSales] = useState("80000");
  const [cogs, setCogs] = useState("25000");
  const [fixed, setFixed] = useState("35000");

  const [price, setPrice] = useState("80");
  const [varCost, setVarCost] = useState("20");
  const [fixedBe, setFixedBe] = useState("35000");
  const [tax, setTax] = useState("6");

  const wc = useMemo(
    () =>
      calcWorkingCapital({
        inventoryCents: reaisToCents(inv),
        receivableDays: Number(recvDays) || 0,
        payableDays: Number(payDays) || 0,
        monthlySalesCents: reaisToCents(sales),
        monthlyCogsCents: reaisToCents(cogs),
        monthlyFixedCents: reaisToCents(fixed),
      }),
    [inv, recvDays, payDays, sales, cogs, fixed]
  );

  const be = useMemo(
    () =>
      calcBreakEven({
        unitPriceCents: reaisToCents(price),
        variableCostCents: reaisToCents(varCost),
        fixedCostsCents: reaisToCents(fixedBe),
        taxPercent: Number(tax) || 0,
      }),
    [price, varCost, fixedBe, tax]
  );

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section className="panel" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Capital de giro</h2>
        <div className="form-grid" style={{ gap: 8 }}>
          <label>
            Estoque (R$)
            <input className="search-input" value={inv} onChange={(e) => setInv(e.target.value)} />
          </label>
          <label>
            Prazo recebimento (dias)
            <input className="search-input" value={recvDays} onChange={(e) => setRecvDays(e.target.value)} />
          </label>
          <label>
            Prazo pagamento (dias)
            <input className="search-input" value={payDays} onChange={(e) => setPayDays(e.target.value)} />
          </label>
          <label>
            Vendas mensais (R$)
            <input className="search-input" value={sales} onChange={(e) => setSales(e.target.value)} />
          </label>
          <label>
            CMV mensal (R$)
            <input className="search-input" value={cogs} onChange={(e) => setCogs(e.target.value)} />
          </label>
          <label>
            Despesas fixas (R$)
            <input className="search-input" value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </label>
        </div>
        <ul style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          <li>A receber projetado: {formatMoney(wc.receivablesCents)}</li>
          <li>A pagar projetado: {formatMoney(wc.payablesCents)}</li>
          <li>
            <strong>NCG / capital de giro: {formatMoney(wc.workingCapitalCents)}</strong>
          </li>
          <li>Cobertura (dias de fixo): {wc.coverageDays}</li>
        </ul>
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Ponto de equilíbrio</h2>
        <div className="form-grid" style={{ gap: 8 }}>
          <label>
            Ticket médio (R$)
            <input className="search-input" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Custo variável / ticket (R$)
            <input className="search-input" value={varCost} onChange={(e) => setVarCost(e.target.value)} />
          </label>
          <label>
            Custos fixos mensais (R$)
            <input className="search-input" value={fixedBe} onChange={(e) => setFixedBe(e.target.value)} />
          </label>
          <label>
            Impostos %
            <input className="search-input" value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
        </div>
        <ul style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
          <li>Margem contribuição: {formatMoney(be.contributionMarginCents)}</li>
          <li>PE contábil: {be.breakEvenUnits} tickets · {formatMoney(be.breakEvenRevenueCents)}</li>
          <li>PE econômico (+20%): {formatMoney(be.economicBreakEvenRevenueCents)}</li>
          <li>PE fiscal: {formatMoney(be.fiscalBreakEvenRevenueCents)}</li>
        </ul>
      </section>
    </div>
  );
}
