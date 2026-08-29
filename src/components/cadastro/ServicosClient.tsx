"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { formatMoney } from "@/lib/format";
import type { ServiceRow } from "@/lib/cadastros";

type Props = {
  rows: ServiceRow[];
  total: number;
  q: string;
};

export function ServicosClient({ rows, total, q }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);

  return (
    <>
      <PageHeader
        title="Serviços"
        subtitle={`${total} serviço(s)`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + Novo serviço
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch action="/servicos" q={q} placeholder="Nome do serviço" />
        </div>
        <div className="table-wrap">
          <table className="data-table data-table-clickable">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Categoria</th>
                <th>Duração</th>
                <th>Preço</th>
                <th>Comissão</th>
                <th>Online</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    Nenhum serviço encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => {
                      setEditing(s);
                      setOpen(true);
                    }}
                  >
                    <td className="cell-strong">{s.name}</td>
                    <td>{s.categoryName ?? "—"}</td>
                    <td>{s.durationMin} min</td>
                    <td>{formatMoney(s.priceCents)}</td>
                    <td>
                      {s.commissionBps != null ? `${(s.commissionBps / 100).toFixed(0)}%` : "—"}
                    </td>
                    <td>
                      <StatusBadge
                        active={s.bookableOnline}
                        activeLabel="Sim"
                        inactiveLabel="Não"
                      />
                    </td>
                    <td>
                      <StatusBadge active={s.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CatalogDrawer
        kind="service"
        open={open}
        onClose={() => setOpen(false)}
        service={editing}
      />
    </>
  );
}
