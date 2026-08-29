"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { formatMoney } from "@/lib/format";
import type { PackageRow } from "@/lib/cadastros";

type Props = {
  rows: PackageRow[];
  total: number;
  q: string;
};

export function PacotesClient({ rows, total, q }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);

  return (
    <>
      <PageHeader
        title="Pacotes"
        subtitle={`${total} pacote(s)`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + Novo pacote
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch action="/pacotes" q={q} placeholder="Nome do pacote" />
        </div>
        <div className="table-wrap">
          <table className="data-table data-table-clickable">
            <thead>
              <tr>
                <th>Pacote</th>
                <th>Itens</th>
                <th>Preço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="table-empty">
                    Nenhum pacote encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                  >
                    <td className="cell-strong">
                      {p.name}
                      {p.description ? (
                        <small className="cell-meta">{p.description}</small>
                      ) : null}
                    </td>
                    <td>{p.itemCount}</td>
                    <td>{formatMoney(p.priceCents)}</td>
                    <td>
                      <StatusBadge active={p.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CatalogDrawer kind="package" open={open} onClose={() => setOpen(false)} pkg={editing} />
    </>
  );
}
