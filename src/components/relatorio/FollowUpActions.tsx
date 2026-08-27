"use client";

import Link from "next/link";
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
  const donnaHint = encodeURIComponent(
    `Follow-up: ${row.clientName} (${row.daysSince}d sem vir). Pode ajudar a reativar?`
  );

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
      <Link
        href={`/conversas?q=${encodeURIComponent(row.clientName)}&hint=${donnaHint}`}
        className="btn btn-outline btn-sm"
        title="Abrir Conversas IA com contexto de follow-up"
      >
        Donna
      </Link>
    </div>
  );
}
