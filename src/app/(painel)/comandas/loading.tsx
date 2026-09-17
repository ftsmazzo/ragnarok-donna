import { PanelListSkeleton } from "@/components/ui/Skeleton";

export default function ComandasLoading() {
  return (
    <PanelListSkeleton
      title="Carregando comandas"
      headers={["#", "Cliente", "Profissional", "Abertura", "Itens", "Pago", "Total", "Status"]}
      rows={8}
    />
  );
}
