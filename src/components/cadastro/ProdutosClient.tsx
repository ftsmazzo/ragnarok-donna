"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { formatMoney } from "@/lib/format";
import type { ProductRow } from "@/lib/cadastros";

type Props = {
  rows: ProductRow[];
  total: number;
  q: string;
};

export function ProdutosClient({ rows, total, q }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditing(row);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${total} produto(s) · estoque e venda`}
        actions={
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Novo produto
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch
            action="/produtos"
            q={q}
            placeholder="Nome, categoria, marca ou SKU"
          />
        </div>

        <div className="table-wrap">
          <table className="data-table data-table-clickable">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Marca</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Mín.</th>
                <th>Venda</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr
                    key={p.id}
                    className={p.stockQty <= p.minQty ? "row-warn" : undefined}
                    onClick={() => openEdit(p)}
                  >
                    <td className="cell-strong">
                      {p.name}
                      {p.sku ? <small className="cell-meta">SKU {p.sku}</small> : null}
                    </td>
                    <td>{p.category ?? "—"}</td>
                    <td>{p.brand ?? "—"}</td>
                    <td>{formatMoney(p.priceCents)}</td>
                    <td>{p.stockQty}</td>
                    <td>{p.minQty}</td>
                    <td>
                      <StatusBadge active={p.forSale} activeLabel="Sim" inactiveLabel="Não" />
                    </td>
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

      <CatalogDrawer
        kind="product"
        open={open}
        onClose={() => setOpen(false)}
        product={editing}
      />
    </>
  );
}
