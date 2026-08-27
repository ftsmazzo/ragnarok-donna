"use client";

import { useEffect, useState, useTransition } from "react";
import type { AgendaPickerClient } from "@/server/agenda/types";
import { searchClientsAction } from "@/app/(painel)/agenda/actions";
import { formatPhone } from "@/lib/format";

type Props = {
  value: string;
  onChange: (clientId: string, label: string) => void;
  required?: boolean;
};

export function ClientPicker({ value, onChange, required }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AgendaPickerClient[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const rows = await searchClientsAction(q);
      setResults(rows);
    });
  }, [q]);

  return (
    <div className="client-picker">
      <label className="form-field">
        <span>Buscar cliente {required ? "*" : ""}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome ou telefone…"
          autoComplete="off"
        />
      </label>
      <div className="client-picker-list">
        {pending && results.length === 0 ? (
          <p className="client-profile-hint">Buscando…</p>
        ) : null}
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`client-picker-item${value === c.id ? " is-selected" : ""}`}
            onClick={() => onChange(c.id, c.name)}
          >
            <strong>{c.name}</strong>
            <span>{formatPhone(c.phone)}</span>
          </button>
        ))}
        {!pending && results.length === 0 ? (
          <p className="client-profile-hint">Digite ao menos 2 caracteres ou deixe vazio para listar.</p>
        ) : null}
      </div>
    </div>
  );
}
