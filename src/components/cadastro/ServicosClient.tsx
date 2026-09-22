"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { CatalogDrawer } from "@/components/cadastro/CatalogDrawer";
import { deactivateCatalogAction } from "@/app/(painel)/cadastros/actions";
import { formatMoney } from "@/lib/format";
import type { ServiceRow } from "@/lib/cadastros";

type BranchOption = { id: string; name: string };

type Props = {
  rows: ServiceRow[];
  total: number;
  q: string;
  branches: BranchOption[];
  defaultBranchId?: string | null;
  multiBranch?: boolean;
};

export function ServicosClient({
  rows,
  total,
  q,
  branches,
  defaultBranchId = null,
  multiBranch = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDeleteRow(e: React.MouseEvent, service: ServiceRow) {
    e.stopPropagation();
    if (
      !window.confirm(
        `Excluir o serviço "${service.name}"?\nEle some do cadastro e deixa de aparecer na agenda/comanda.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deactivateCatalogAction("service", service.id);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Serviços"
        subtitle={
          multiBranch
            ? `${total} serviço(s) nesta unidade · SPA e outros exclusivos ficam só na unidade escolhida`
            : `${total} serviço(s)`
        }
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
                {multiBranch ? <th>Unidade</th> : null}
                <th>Duração</th>
                <th>Preço</th>
                <th>Comissão</th>
                <th>Online</th>
                <th>Status</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={multiBranch ? 9 : 8} className="table-empty">
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
                    {multiBranch ? (
                      <td>{s.branchName ?? "Todas"}</td>
                    ) : null}
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
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Excluir serviço"
                        aria-label={`Excluir ${s.name}`}
                        disabled={pending}
                        onClick={(e) => handleDeleteRow(e, s)}
                      >
                        🗑
                      </button>
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
        branches={branches}
        defaultBranchId={defaultBranchId}
      />
    </>
  );
}
