"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendBirthdayMessageAction } from "@/app/(painel)/clientes/actions";

type Row = {
  id: string;
  name: string;
  phoneLabel: string;
  phoneE164: string | null;
  birthDate: string;
};

type Props = {
  rows: Row[];
  discountPct: number;
};

export function BirthdayClientsClient({ rows, discountPct }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ clientId: string; conversationId: string } | null>(
    null
  );

  return (
    <div className="panel-body-flush">
      <p className="client-profile-hint" style={{ margin: "12px 12px 0" }}>
        Envio manual sai como mensagem humana (WhatsApp conectado). O automático em
        Disparos continua desligado por padrão e usa a fila.
      </p>
      {error ? <p className="form-error" style={{ margin: 12 }}>{error}</p> : null}
      {sent ? (
        <p className="muted-note" style={{ margin: 12 }}>
          Enviado.{" "}
          <Link href={`/conversas?id=${sent.conversationId}`}>Abrir conversa</Link>
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Aniversário</th>
              <th>Telefone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="table-empty">
                  Nenhum aniversariante neste período. Cadastre a data de nascimento no cliente.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-strong">{r.name}</td>
                  <td>{r.birthDate.slice(5).split("-").reverse().join("/")}</td>
                  <td>{r.phoneLabel || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={pending || !r.phoneE164}
                      onClick={() => {
                        setError("");
                        setSent(null);
                        startTransition(async () => {
                          const result = await sendBirthdayMessageAction(r.id);
                          if (!result.ok) {
                            setError(result.error);
                            return;
                          }
                          setSent({
                            clientId: r.id,
                            conversationId: result.conversationId,
                          });
                          router.refresh();
                        });
                      }}
                    >
                      {sent?.clientId === r.id
                        ? "Enviado"
                        : `Enviar Zap (−${discountPct}%)`}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
