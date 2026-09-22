"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import {
  importEntriesFileAction,
  importChartFileAction,
  seedDonnaAction,
  saveBridgeSettingsAction,
  backfillBridgeAction,
} from "@/app/(painel)/financeiro/actions";

type Props = {
  bridge: {
    enabled: boolean;
    methodCodes: string[];
    defaultChartAccountCode: string;
  };
  canWrite: boolean;
  /** Só tenants Donna veem o seed da planilha Donna. */
  showDonnaSeed: boolean;
};

export function TreasuryAdminPanel({ bridge, canWrite, showDonnaSeed }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");
  const entriesRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<HTMLInputElement>(null);

  if (!canWrite) return null;

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const b64 = result.includes(",") ? result.split(",")[1] : result;
        resolve(b64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function onImport(
    file: File | undefined,
    kind: "entries" | "chart"
  ) {
    if (!file) return;
    startTransition(async () => {
      setBusyLabel(kind === "entries" ? "Importando títulos…" : "Importando plano…");
      try {
        const base64 = await readFileAsBase64(file);
        const res =
          kind === "entries"
            ? await importEntriesFileAction({ base64, fileName: file.name })
            : await importChartFileAction({ base64, fileName: file.name });
        if (res.ok) {
          showToast(
            `${res.imported} importados · ${res.skipped} ignorados`,
            "success"
          );
          router.refresh();
        } else showToast(res.error, "error");
      } catch {
        showToast("Não foi possível ler o arquivo", "error");
      } finally {
        setBusyLabel("");
      }
    });
  }

  return (
    <section className="panel treasury-admin" style={{ marginTop: 16 }}>
      <div className="panel-toolbar" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Importar e integrações</h2>
        {busyLabel ? <span className="muted">{busyLabel}</span> : null}
      </div>

      <div className="treasury-admin-grid">
        <div className="treasury-admin-card">
          <strong>Planilha / CSV</strong>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
            Excel (.xlsx) ou CSV — aba <code>base_de_dados</code> ou{" "}
            <code>plano_de_contas</code>.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => entriesRef.current?.click()}
            >
              Importar títulos
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() => chartRef.current?.click()}
            >
              Importar plano de contas
            </button>
          </div>
          <input
            ref={entriesRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              onImport(e.target.files?.[0], "entries");
              e.target.value = "";
            }}
          />
          <input
            ref={chartRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={(e) => {
              onImport(e.target.files?.[0], "chart");
              e.target.value = "";
            }}
          />
        </div>

        <div className="treasury-admin-card">
          <strong>Ponte comanda → tesouraria</strong>
          <p className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
            Espelha pagamentos do POS sem alterar o caixa do turno.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${bridge.enabled ? "btn-primary" : "btn-outline"}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await saveBridgeSettingsAction({
                    enabled: !bridge.enabled,
                    methodCodes: bridge.methodCodes,
                    defaultChartAccountCode: bridge.defaultChartAccountCode,
                  });
                  if (res.ok) {
                    showToast(
                      bridge.enabled ? "Ponte desligada" : "Ponte ligada",
                      "success"
                    );
                    router.refresh();
                  } else showToast(res.error, "error");
                })
              }
            >
              {bridge.enabled ? "Ponte ON" : "Ponte OFF"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending || !bridge.enabled}
              onClick={() =>
                startTransition(async () => {
                  const res = await backfillBridgeAction();
                  if (res.ok) {
                    showToast(`${res.created} pagamentos espelhados`, "success");
                    router.refresh();
                  } else showToast(res.error, "error");
                })
              }
            >
              Backfill
            </button>
          </div>
        </div>

        {showDonnaSeed ? (
          <div className="treasury-admin-card">
            <strong>Seed Donna Elegant</strong>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
              Só nesta unidade — plano + amostra da planilha DFC.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await seedDonnaAction();
                  if (res.ok) {
                    showToast(
                      `${res.accounts} contas · ${res.entries} títulos`,
                      "success"
                    );
                    router.refresh();
                  } else showToast(res.error, "error");
                })
              }
            >
              Carregar amostra Donna
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
