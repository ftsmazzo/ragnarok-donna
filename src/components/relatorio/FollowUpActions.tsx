"use client";

import { useState } from "react";
import type { FollowUpRow } from "@/server/insights/types";
import { buildFollowUpDraft } from "@/lib/followup";

type Props = {
  row: FollowUpRow;
  tenantName: string;
};

function digitsPhone(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") ? d : `55${d}`;
}

export function FollowUpActions({ row, tenantName }: Props) {
  const [copied, setCopied] = useState(false);
  const draft = buildFollowUpDraft(row, tenantName);
  const wa = digitsPhone(row.phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="followup-actions">
      <button type="button" className="btn btn-outline btn-sm" onClick={copy} title={draft}>
        {copied ? "Copiado" : "Copiar msg"}
      </button>
      {wa ? (
        <a
          className="btn btn-primary btn-sm"
          href={`https://wa.me/${wa}?text=${encodeURIComponent(draft)}`}
          target="_blank"
          rel="noreferrer"
        >
          WhatsApp
        </a>
      ) : (
        <span className="badge is-muted" title="Cadastre o telefone do cliente">
          Sem tel.
        </span>
      )}
      <span className="followup-soon" title="Sprint 6 — Donna gera e agenda via Evolution">
        Agendar IA
      </span>
    </div>
  );
}
