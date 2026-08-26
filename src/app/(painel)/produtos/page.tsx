import { PageHeader } from "@/components/shell/PageHeader";
import { CadastroSearch } from "@/components/cadastro/CadastroSearch";
import { StatusBadge } from "@/components/cadastro/StatusBadge";
import { listProducts } from "@/lib/cadastros";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProdutosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const data = await listProducts({ q: sp.q });

  return (
    <>
      <PageHeader
        title="Produtos"
        subtitle={`${data.total} produto(s) · estoque e venda`}
        actions={
          <button type="button" className="btn btn-primary" disabled title="Em breve">
            + Novo produto
          </button>
        }
      />

      <section className="panel">
        <div className="panel-toolbar">
          <CadastroSearch
            action="/produtos"
            q={data.q}
            placeholder="Nome, categoria, marca ou SKU"
          />
        </div>

        <div className="table-wrap">
          <table className="data-table">
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
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                data.rows.map((p) => (
                  <tr key={p.id} className={p.stockQty <= p.minQty ? "row-warn" : undefined}>
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
    </>
  );
}
