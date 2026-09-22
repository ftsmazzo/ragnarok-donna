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
    <div className="treasury-admin-grid">
      <section className="panel" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Capital de giro</h2>
        <div className="form-stack">
          <label className="form-field">
            <span>Estoque (R$)</span>
            <input value={inv} onChange={(e) => setInv(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Prazo recebimento (dias)</span>
            <input value={recvDays} onChange={(e) => setRecvDays(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Prazo pagamento (dias)</span>
            <input value={payDays} onChange={(e) => setPayDays(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Vendas mensais (R$)</span>
            <input value={sales} onChange={(e) => setSales(e.target.value)} />
          </label>
          <label className="form-field">
            <span>CMV mensal (R$)</span>
            <input value={cogs} onChange={(e) => setCogs(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Despesas fixas (R$)</span>
            <input value={fixed} onChange={(e) => setFixed(e.target.value)} />
          </label>
        </div>
        <ul className="muted-note" style={{ marginTop: 14, paddingLeft: 18 }}>
          <li>A receber projetado: {formatMoney(wc.receivablesCents)}</li>
          <li>A pagar projetado: {formatMoney(wc.payablesCents)}</li>
          <li>
            <strong>NCG / capital de giro: {formatMoney(wc.workingCapitalCents)}</strong>
          </li>
          <li>Cobertura (dias de fixo): {wc.coverageDays}</li>
        </ul>
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>Ponto de equilíbrio</h2>
        <div className="form-stack">
          <label className="form-field">
            <span>Ticket médio (R$)</span>
            <input value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Custo variável / ticket (R$)</span>
            <input value={varCost} onChange={(e) => setVarCost(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Custos fixos mensais (R$)</span>
            <input value={fixedBe} onChange={(e) => setFixedBe(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Impostos %</span>
            <input value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
        </div>
        <ul className="muted-note" style={{ marginTop: 14, paddingLeft: 18 }}>
          <li>Margem contribuição: {formatMoney(be.contributionMarginCents)}</li>
          <li>
            PE contábil: {be.breakEvenUnits} tickets · {formatMoney(be.breakEvenRevenueCents)}
          </li>
          <li>PE econômico (+20%): {formatMoney(be.economicBreakEvenRevenueCents)}</li>
          <li>PE fiscal: {formatMoney(be.fiscalBreakEvenRevenueCents)}</li>
        </ul>
      </section>
    </div>
  );
}
