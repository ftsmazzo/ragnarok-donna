"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { triggerDonnaImportAction } from "@/app/(painel)/inicio/donna-import-actions";
import type { DonnaImportStatus } from "@/server/tenant/donna-import";

type Props = {
  status: DonnaImportStatus;
};

export function DonnaImportBanner({ status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const needsImport = status.clients < 100;
  const showBanner = needsImport || status.importRunning;

  useEffect(() => {
    if (!status.importRunning) return;
    const id = window.setInterval(() => router.refresh(), 20_000);
    return () => window.clearInterval(id);
  }, [status.importRunning, router]);

  if (!showBanner) return null;

  function onImport() {
    startTransition(async () => {
      await triggerDonnaImportAction();
      router.refresh();
    });
  }

  const last = status.lastImport;
  const failed = last?.status === "failed";

  return (
    <div className={`form-error banner-inline${failed ? "" : " banner-info"}`}>
      {status.importRunning ? (
        <p>
          Importação do AppBeleza em andamento… ({status.clients.toLocaleString("pt-BR")}{" "}
          clientes até agora). A página atualiza automaticamente.
        </p>
      ) : failed ? (
        <p>
          A última importação falhou
          {last?.error ? `: ${last.error}` : "."}{" "}
          {!status.exportAvailable
            ? "Arquivos de exportação não encontrados no servidor."
            : null}
        </p>
      ) : (
        <p>
          Unidade 01 ainda sem dados do AppBeleza ({status.clients.toLocaleString("pt-BR")}{" "}
          clientes). Clique abaixo para iniciar a importação (~1.800 clientes, agenda e
          comandas).
        </p>
      )}
      {!status.importRunning && status.exportAvailable ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          style={{ marginTop: "0.5rem" }}
          disabled={pending}
          onClick={onImport}
        >
          {pending ? "Iniciando…" : failed ? "Tentar importação novamente" : "Importar dados"}
        </button>
      ) : null}
    </div>
  );
}
