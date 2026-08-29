"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { FollowUpRow } from "@/server/insights/types";
import { buildFollowUpDraft } from "@/lib/followup";
import { sendFollowUpWhatsAppAction } from "@/app/(painel)/relatorios/followup-actions";

type Props = {
  row: FollowUpRow;
  tenantName: string;
};

export function FollowUpActions({ row, tenantName }: Props) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = buildFollowUpDraft(row, tenantName);
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

  function sendZap() {
    setMsg(null);
    startTransition(async () => {
      const result = await sendFollowUpWhatsAppAction(row);
      if (!result.ok) {
        setMsg(result.error);
        return;
      }
      setMsg("WhatsApp enviado pela Donna");
    });
  }

  return (
    <div className="followup-actions">
      <button type="button" className="btn btn-outline btn-sm" onClick={copy} title={draft}>
        {copied ? "Copiado" : "Copiar msg"}
      </button>
      {row.phone ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={sendZap}
          title="Envia pelo WhatsApp conectado da unidade (Evolution)"
        >
          {pending ? "Enviando…" : "Enviar Zap"}
        </button>
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
      {msg ? (
        <span className={msg.includes("enviado") ? "badge is-success" : "badge is-warn"}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}
