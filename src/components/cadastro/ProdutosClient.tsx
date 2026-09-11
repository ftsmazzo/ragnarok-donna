"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { consumeInternalStockAction } from "@/app/(painel)/cadastros/actions";
import { formatMoney } from "@/lib/format";
import type { ProductRow } from "@/lib/cadastros";

type Props = {
  rows: ProductRow[];
  total: number;
  q: string;
};

export function ProdutosClient({ rows, total, q }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: ProductRow) {
    setEditing(row);
    setOpen(true);
  }

  function baixarUso(e: React.MouseEvent, row: ProductRow) {
    e.stopPropagation();
    if (!row.forInternalUse) return;
    const ok = window.confirm(`Baixar 1 un. de “${row.name}” (uso interno)?`);
    if (!ok) return;
    setFlash(null);
    startTransition(async () => {
      const result = await consumeInternalStockAction(row.id, 1);
      if (!result.ok) {
        setFlash(result.error ?? "Falha ao baixar");
        return;
      }
      setFlash(`Baixou 1 un. de ${row.name}`);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${total} produto(s) · estoque, venda e uso interno`}
        actions={
          <button type="button" className="btn btn-primary" onClick={openNew}>
            + Novo produto
          </button>
        }
      />

      {flash ? <div className="form-error" style={{ marginBottom: 12 }}>{flash}</div> : null}

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
                <th>Uso int.</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-empty">
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
                      <StatusBadge
                        active={p.forInternalUse}
                        activeLabel="Sim"
                        inactiveLabel="Não"
                      />
                    </td>
                    <td>
                      <StatusBadge active={p.isActive} />
                    </td>
                    <td>
                      {p.forInternalUse ? (
                        <button
                          type="button"
                          className="btn btn-outline"
                          disabled={pending || p.stockQty < 1}
                          onClick={(e) => baixarUso(e, p)}
                        >
                          Baixar 1
                        </button>
                      ) : null}
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
