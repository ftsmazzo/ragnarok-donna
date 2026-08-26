import { RelatorioStub } from "@/components/shell/RelatorioStub";

export default function RelatorioComandasPage() {
  return (
    <RelatorioStub
      title="Relatório Gerencial — Comandas"
      subtitle="Consumo por período, serviços e produtos"
      filters={["Data inicial", "Data final", "Profissional", "Status"]}
    />
  );
}
