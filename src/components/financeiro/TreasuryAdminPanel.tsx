"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { seedDonnaAction, saveBridgeSettingsAction, backfillBridgeAction } from "@/app/(painel)/financeiro/actions";

type Props = {
  bridge: {
    enabled: boolean;
    methodCodes: string[];
    defaultChartAccountCode: string;
  };
  canWrite: boolean;
};

export function TreasuryAdminPanel({ bridge, canWrite }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Administração</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await seedDonnaAction();
              if (res.ok) {
                showToast(
                  `Seed: ${res.accounts} contas, ${res.entries} títulos, ${res.banks} bancos`
                );
                router.refresh();
              } else showToast(res.error, "error");
            })
          }
        >
          Importar plano Donna + amostra
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveBridgeSettingsAction({
                enabled: !bridge.enabled,
                methodCodes: bridge.methodCodes,
                defaultChartAccountCode: bridge.defaultChartAccountCode,
              });
              if (res.ok) {
                showToast(bridge.enabled ? "Ponte POS desligada" : "Ponte POS ligada");
                router.refresh();
              } else showToast(res.error, "error");
            })
          }
        >
          Ponte POS: {bridge.enabled ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={pending || !bridge.enabled}
          onClick={() =>
            startTransition(async () => {
              const res = await backfillBridgeAction();
              if (res.ok) {
                showToast(`${res.created} pagamentos espelhados`);
                router.refresh();
              } else showToast(res.error, "error");
            })
          }
        >
          Backfill pagamentos → tesouraria
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
        A ponte gera título de receita por pagamento (idempotente) sem alterar o caixa do turno.
      </p>
    </section>
  );
}
