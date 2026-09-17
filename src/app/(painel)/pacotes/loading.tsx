import { PanelListSkeleton } from "@/components/ui/Skeleton";

export default function PacotesLoading() {
  return (
    <PanelListSkeleton
      title="Carregando pacotes"
      headers={["Nome", "Preço", "Itens", "Validade", "Status"]}
      rows={8}
    />
  );
}
