import { RelatorioStub } from "@/components/shell/RelatorioStub";

export default function RelatorioFinanceiroPage() {
  return (
    <RelatorioStub
      title="Relatório Gerencial — Financeiro"
      subtitle="Dashboard, receitas, despesas e movimentações de caixa"
      filters={["Data inicial", "Data final", "Tipo", "Profissional"]}
    />
  );
}
