import { RelatorioStub } from "@/components/shell/RelatorioStub";

export default function RelatorioEstoquePage() {
  return (
    <RelatorioStub
      title="Relatório Gerencial — Estoque"
      subtitle="Movimentação e saldo de produtos"
      filters={["Data inicial", "Data final", "Produto", "Categoria"]}
    />
  );
}
