import { PanelListSkeleton } from "@/components/ui/Skeleton";

export default function ClientesLoading() {
  return (
    <PanelListSkeleton
      title="Carregando clientes"
      headers={["Nome", "Telefone", "E-mail", "Conta", "Pontos", "Status"]}
      rows={10}
    />
  );
}
