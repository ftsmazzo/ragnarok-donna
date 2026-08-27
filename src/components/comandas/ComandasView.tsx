"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { OpenOrderModal } from "@/components/comandas/OpenOrderModal";
import { OrderDrawer } from "@/components/comandas/OrderDrawer";
import { formatDateTimeSp } from "@/lib/datetime";
import { formatMoney, labelOrderStatus } from "@/lib/format";
import type {
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderListItem,
  OrderPermissions,
} from "@/server/orders/types";

type ListData = {
  rows: OrderListItem[];
  total: number;
  totalCents: number;
  q: string;
};

type Props = {
  data: ListData;
  selectedOrder: OrderDetail | null;
  services: CatalogService[];
  products: CatalogProduct[];
  staff: CatalogStaff[];
  permissions: OrderPermissions;
  openNew: boolean;
};

export function ComandasView({
  data,
  selectedOrder,
  services,
  products,
  staff,
  permissions,
  openNew,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [newOpen, setNewOpen] = useState(openNew);

  function buildUrl(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function openOrder(id: string) {
    router.push(buildUrl({ id, novo: undefined }));
  }

  function closeDrawer() {
    router.push(buildUrl({ id: undefined, novo: undefined }));
  }

  function onCreated(id: string) {
    setNewOpen(false);
    router.push(buildUrl({ id, novo: undefined }));
    router.refresh();
  }

  function onChanged() {
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Comandas abertas"
        subtitle={`${data.total} comanda(s) em aberto · ${formatMoney(data.totalCents)}`}
        actions={
          permissions.canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setNewOpen(true)}>
              + Nova comanda
            </button>
          ) : undefined
        }
      />

      <SummaryCards
        cards={[
          { label: "Comandas abertas", value: data.total },
          { label: "Valor em aberto", value: formatMoney(data.totalCents) },
        ]}
      />

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="panel-toolbar">
          <CadastroSearch action="/comandas" q={data.q} placeholder="Cliente ou código" />
        </div>

        <div className="table-wrap">
          <table className="data-table data-table-clickable">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Profissional</th>
                <th>Abertura</th>
                <th>Itens</th>
                <th>Pago</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhuma comanda aberta.
                  </td>
                </tr>
              ) : (
                data.rows.map((o) => (
                  <tr
                    key={o.id}
                    className={selectedOrder?.id === o.id ? "is-selected" : undefined}
                    onClick={() => openOrder(o.id)}
                  >
                    <td>{o.externalId ?? o.id.slice(0, 8)}</td>
                    <td className="cell-strong">{o.clientName ?? "—"}</td>
                    <td>{o.staffLabel ?? "—"}</td>
                    <td>{formatDateTimeSp(o.openedAt)}</td>
                    <td>{o.itemCount}</td>
                    <td>{formatMoney(o.paidCents)}</td>
                    <td>{formatMoney(o.totalCents)}</td>
                    <td>
                      <span className="badge is-warn">{labelOrderStatus(o.status)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {permissions.canWrite ? (
        <OpenOrderModal
          open={newOpen}
          onClose={() => {
            setNewOpen(false);
            if (openNew) router.push(buildUrl({ novo: undefined }));
          }}
          onCreated={onCreated}
        />
      ) : null}

      {selectedOrder ? (
        <OrderDrawer
          open
          order={selectedOrder}
          services={services}
          products={products}
          staff={staff}
          permissions={permissions}
          onClose={closeDrawer}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
