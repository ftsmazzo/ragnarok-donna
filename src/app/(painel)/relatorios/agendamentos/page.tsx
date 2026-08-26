import { RelatorioStub } from "@/components/shell/RelatorioStub";

export default function RelatorioAgendamentosPage() {
  return (
    <RelatorioStub
      title="Relatório de Agendamentos"
      subtitle="Período, status, cliente e profissional"
      filters={["Data inicial", "Data final", "Status", "Cliente", "Profissional"]}
    />
  );
}
