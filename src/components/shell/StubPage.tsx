import { PageHeader } from "@/components/shell/PageHeader";

type StubPageProps = {
  title: string;
  subtitle?: string;
  hint?: string;
};

export function StubPage({ title, subtitle, hint }: StubPageProps) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button type="button" className="btn btn-primary">
            + Novo
          </button>
        }
      />
      <section className="panel">
        <div className="panel-body empty-state">
          <p>{hint ?? "Tela em construção — estrutura e menu já no padrão operacional."}</p>
        </div>
      </section>
    </>
  );
}
