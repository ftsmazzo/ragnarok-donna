"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recalcCommissionsAction } from "@/app/(painel)/comissoes/actions";

type Props = {
  from: string;
  to: string;
};

export function RecalcCommissionsButton({ from, to }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function run() {
    setMsg("");
    startTransition(async () => {
      const result = await recalcCommissionsAction({ from, to });
      if (!result.ok) {
        setMsg(result.error ?? "Erro ao recalcular");
        return;
      }
      setMsg(
        result.updated === 0
          ? `Nada a corrigir (${result.scanned} item(ns) ok).`
          : `Corrigidos ${result.updated} de ${result.scanned} item(ns).`
      );
      router.refresh();
    });
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={run}
        disabled={pending}
        title="Aplica o % do serviço/produto (ou do profissional) nos itens já fechados, sem reabrir comanda"
      >
        {pending ? "Recalculando…" : "Corrigir do catálogo"}
      </button>
      {msg ? <span className="muted" style={{ fontSize: 13 }}>{msg}</span> : null}
    </span>
  );
}
