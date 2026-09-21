"use client";

import { useState, useTransition } from "react";
import { saveExtrasGoalAction } from "@/app/(painel)/relatorios/extras/actions";

type Row = {
  staffId: string;
  staffName: string;
  goalCents: number;
  goalQty: number | null;
};

type Props = {
  rows: Row[];
};

export function ExtrasGoalsForm({ rows }: Props) {
  const [staffId, setStaffId] = useState(rows[0]?.staffId ?? "");
  const [amount, setAmount] = useState(() => {
    const first = rows[0];
    return first ? (first.goalCents / 100).toFixed(0) : "";
  });
  const [qty, setQty] = useState(() => {
    const first = rows[0];
    return first?.goalQty != null ? String(first.goalQty) : "";
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onStaffChange(id: string) {
    setStaffId(id);
    const row = rows.find((r) => r.staffId === id);
    setAmount(row ? (row.goalCents / 100).toFixed(0) : "");
    setQty(row?.goalQty != null ? String(row.goalQty) : "");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const result = await saveExtrasGoalAction({
        staffId,
        amountReais: amount,
        qty: qty || undefined,
      });
      if (!result.ok) {
        setMsg(result.error);
        return;
      }
      setMsg("Meta salva.");
    });
  }

  if (!rows.length) return null;

  return (
    <form className="extras-goals-form" onSubmit={onSubmit}>
      <label className="filter-field">
        <span>Profissional</span>
        <select
          className="search-input"
          value={staffId}
          onChange={(e) => onStaffChange(e.target.value)}
          disabled={pending}
        >
          {rows.map((r) => (
            <option key={r.staffId} value={r.staffId}>
              {r.staffName}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-field">
        <span>Meta R$ / mês</span>
        <input
          className="search-input"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="ex.: 2000"
          disabled={pending}
        />
      </label>
      <label className="filter-field">
        <span>Meta qtd (opcional)</span>
        <input
          className="search-input"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="—"
          disabled={pending}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending || !staffId}>
        {pending ? "Salvando…" : "Salvar meta"}
      </button>
      {msg ? <p className="muted-note">{msg}</p> : null}
    </form>
  );
}
