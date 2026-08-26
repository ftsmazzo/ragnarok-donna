import { RelatorioStub } from "@/components/shell/RelatorioStub";

export default function RelatorioPerfilPage() {
  return (
    <RelatorioStub
      title="Relatório Gerencial — Perfil"
      subtitle="Indicadores por cliente e recorrência"
      filters={["Data inicial", "Data final", "Cliente"]}
    />
  );
}
