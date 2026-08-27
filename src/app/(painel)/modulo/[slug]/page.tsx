import { redirect } from "next/navigation";
import { StubPage } from "@/components/shell/StubPage";

const LABELS: Record<string, { title: string; subtitle?: string }> = {
  clube: { title: "Clube / Assinaturas", subtitle: "Export parcial disponível — implementação pendente" },
  mensagens: { title: "Mensagens", subtitle: "Lembretes e comunicação com clientes" },
  pesquisa: { title: "Pesquisa de satisfação", subtitle: "Módulo AppBarber — backlog" },
  contas: { title: "Contas", subtitle: "Contas a pagar/receber" },
  rodizio: { title: "Rodízio de profissionais", subtitle: "Ordem automática na agenda" },
  funcionamento: { title: "Funcionamento", subtitle: "Horário da unidade e feriados" },
  alertas: { title: "Alertas", subtitle: "Comandas abertas, recorrências, etc." },
  anamnese: { title: "Anamnese", subtitle: "Fichas de saúde — cliente não usava" },
};

type Props = { params: Promise<{ slug: string }> };

export default async function ModuloBacklogPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "fluxo-caixa") {
    redirect("/relatorios/fluxo");
  }
  if (slug === "alertas") {
    redirect("/alertas");
  }
  if (slug === "contas") {
    redirect("/contas");
  }
  const meta = LABELS[slug] ?? { title: slug, subtitle: "Módulo em backlog" };
  return (
    <StubPage
      title={meta.title}
      subtitle={meta.subtitle}
      hint="Item mapeado do AppBarber para não esquecer na migração. Dados ainda não importados."
    />
  );
}
