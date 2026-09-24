"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Pagination } from "@/components/cadastro/Pagination";
import { OrdersTable } from "@/components/comandas/OrdersTable";
import { OpenStaffConsumptionModal } from "@/components/comandas/OpenStaffConsumptionModal";
import { OrderDrawer } from "@/components/comandas/OrderDrawer";
import { RelatorioFilters } from "@/components/relatorio/RelatorioFilters";
import { SummaryCards } from "@/components/relatorio/SummaryCards";
import { formatMoney } from "@/lib/format";
import { reopenOrderAction } from "@/app/(painel)/comandas/actions";
import type {
  CatalogPackage,
  CatalogProduct,
  CatalogService,
  CatalogStaff,
  OrderDetail,
  OrderListItem,
  OrderPermissions,
} from "@/server/orders/types";

type HistoryData = {
  rows: OrderListItem[];
  total: number;
  totalCents: number;
  from: string;
  to: string;
  status: string;
  q: string;
  page: number;
  totalPages: number;
};

type Props = {
  data: HistoryData;
  selectedOrder: OrderDetail | null;
  services: CatalogService[];
  products: CatalogProduct[];
  packages: CatalogPackage[];
  staff: CatalogStaff[];
  permissions: OrderPermissions;
};

export function HistoricoComandasView({
  data,
  selectedOrder,
  services,
  products,
  packages,
  staff,
  permissions,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [staffConsumptionOpen, setStaffConsumptionOpen] = useState(false);
  const [, startTransition] = useTransition();

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
    router.push(buildUrl({ id }));
  }

  function closeDrawer() {
    router.push(buildUrl({ id: undefined }));
  }

  function onChanged() {
    router.refresh();
  }

  function handleReopen(id: string) {
    setError("");
    setPendingId(id);
    startTransition(async () => {
      const result = await reopenOrderAction(id);
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Não foi possível reabrir");
        return;
      }
      router.push(buildUrl({ id }));
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Histórico de comandas"
        subtitle={`${data.total.toLocaleString("pt-BR")} comanda(s) no período`}
        actions={
          permissions.canWrite ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStaffConsumptionOpen(true)}
            >
              Consumo de profissional
            </button>
          ) : undefined
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <RelatorioFilters
            action="/comandas/historico"
            from={data.from}
            to={data.to}
            q={data.q}
            showSearch
            submitLabel="Buscar"
            qPlaceholder="Cliente, telefone ou código"
          >
            <label className="filter-field">
              <span>Status</span>
              <select name="status" defaultValue={data.status} className="search-input">
                <option value="all">Todos</option>
                <option value="open">Abertas</option>
                <option value="closed">Fechadas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </label>
          </RelatorioFilters>
        </div>

        <div className="panel-body-flush">
          {error ? <div className="form-error" style={{ margin: "12px 16px" }}>{error}</div> : null}
          <SummaryCards
            cards={[
              { label: "Comandas", value: data.total.toLocaleString("pt-BR") },
              { label: "Valor total", value: formatMoney(data.totalCents) },
            ]}
          />
          <OrdersTable
            rows={data.rows.map((r) => ({
              id: r.id,
              externalId: r.externalId,
              clientName: r.clientName,
              openedAt: r.openedAt,
              closedAt: r.closedAt,
              totalCents: r.totalCents,
              status: r.status,
              itemCount: r.itemCount,
              profissional: r.staffLabel,
            }))}
            onRowClick={openOrder}
            onReopen={permissions.canReopen ? handleReopen : undefined}
            canReopen={permissions.canReopen}
            selectedId={selectedOrder?.id}
            pendingId={pendingId}
          />
        </div>
        <div className="panel-footer">
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            basePath="/comandas/historico"
            params={{
              from: data.from,
              to: data.to,
              status: data.status !== "all" ? data.status : undefined,
              q: data.q || undefined,
            }}
          />
        </div>
      </section>

      {permissions.canWrite ? (
        <OpenStaffConsumptionModal
          open={staffConsumptionOpen}
          onClose={() => setStaffConsumptionOpen(false)}
          onCreated={(id) => {
            setStaffConsumptionOpen(false);
            router.push(`/comandas?id=${id}`);
            router.refresh();
          }}
          staff={staff}
        />
      ) : null}

      {selectedOrder ? (
        <OrderDrawer
          open
          order={selectedOrder}
          services={services}
          products={products}
          packages={packages}
          staff={staff}
          permissions={permissions}
          onClose={closeDrawer}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
