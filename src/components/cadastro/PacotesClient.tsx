"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { formatMoney } from "@/lib/format";
import {
  PackageSaleModal,
  type PackageSaleOption,
} from "@/components/pacotes/PackageSaleModal";
import type { PackageRow } from "@/lib/cadastros";

function buildItemLabel(
  p: PackageRow,
  services: Array<{ id: string; name: string }>,
  products: Array<{ id: string; name: string }>
): string {
  return p.items
    .map((item) => {
      const name =
        (item.serviceId && services.find((s) => s.id === item.serviceId)?.name) ||
        (item.productId && products.find((pr) => pr.id === item.productId)?.name) ||
        "Item";
      return `${item.qty}× ${name}`;
    })
    .join(" · ");
}

function sellablePackages(
  rows: PackageRow[],
  services: Array<{ id: string; name: string }>,
  products: Array<{ id: string; name: string }>
): PackageSaleOption[] {
  return rows
    .filter(
      (p) => p.isActive && p.itemCount > 0 && p.unresolvedServiceCount === 0
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      expiresAfterDays: p.expiresAfterDays,
      itemLabel: buildItemLabel(p, services, products),
    }));
}

type Props = {
  rows: PackageRow[];
  total: number;
  q: string;
  services: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
};

export function PacotesClient({ rows, total, q, services, products }: Props) {
  const [open, setOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [editing, setEditing] = useState<PackageRow | null>(null);
  const unresolvedTotal = rows.filter((p) => p.unresolvedServiceCount > 0).length;
  const salePackages = sellablePackages(rows, services, products);

  return (
    <>
      <PageHeader
        title="Pacotes"
        subtitle={`${total} pacote(s)`}
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline"
              disabled={salePackages.length === 0}
              onClick={() => setSaleOpen(true)}
              data-testid="pacotes-vender"
            >
              Vender pacote
            </button>
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
          </>
        }
      />

      {unresolvedTotal > 0 ? (
        <p className="client-profile-hint" style={{ marginBottom: 12 }}>
          {unresolvedTotal} pacote(s) com serviço não vinculado — abra e selecione o serviço
          para voltar a aparecer em <strong>Vender pacote</strong> e na comanda.
        </p>
      ) : null}

      {salePackages.length === 0 && total > 0 ? (
        <p className="order-wallet-warn" style={{ marginBottom: 12 }}>
          Há pacotes cadastrados, mas nenhum está pronto para venda (falta vínculo de serviço).
          Corrija acima e o botão <strong>Vender pacote</strong> libera.
        </p>
      ) : null}

      {total === 0 ? (
        <p className="client-profile-hint" style={{ marginBottom: 12 }}>
          Nenhum pacote ainda. Crie com <strong>+ Novo pacote</strong> (nome, preço, itens e
          validade) — depois use <strong>Vender pacote</strong> (cliente + pagamento + Comprar).
        </p>
      ) : null}

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
                      {p.unresolvedServiceCount > 0 ? (
                        <small className="cell-meta" style={{ color: "var(--danger, #b42318)" }}>
                          {p.unresolvedServiceCount} serviço(s) sem vínculo — edite para corrigir
                        </small>
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

      <CatalogDrawer
        kind="package"
        open={open}
        onClose={() => setOpen(false)}
        pkg={editing}
        serviceOptions={services}
        productOptions={products}
      />

      <PackageSaleModal
        open={saleOpen}
        onClose={() => setSaleOpen(false)}
        packages={salePackages}
      />
    </>
  );
}
