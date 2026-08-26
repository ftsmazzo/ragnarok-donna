import { PageHeader } from "@/components/shell/PageHeader";

type RelatorioStubProps = {
  title: string;
  subtitle: string;
  filters: string[];
};

export function RelatorioStub({ title, subtitle, filters }: RelatorioStubProps) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <button type="button" className="btn btn-outline">
              Excel
            </button>
            <button type="button" className="btn btn-outline">
              PDF
            </button>
            <button type="button" className="btn btn-primary">
              Gerar
            </button>
          </>
        }
      />
      <section className="panel">
        <div className="panel-toolbar">
          {filters.map((f) => (
            <span key={f} className="chip">
              {f}
            </span>
          ))}
        </div>
        <div className="panel-body empty-state">
          <p>
            Relatório em construção. Após o import AppBarber, os dados de agenda,
            comandas e caixa alimentam esta tela com os mesmos filtros do sistema
            atual.
          </p>
        </div>
      </section>
    </>
  );
}
