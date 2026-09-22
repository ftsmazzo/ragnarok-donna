import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { CalculatorsClient } from "@/components/financeiro/CalculatorsClient";
import { requirePageAccess } from "@/server/permissions/page-access";

export const dynamic = "force-dynamic";

export default async function CalculadorasPage() {
  await requirePageAccess("/financeiro/calculadoras");

  return (
    <>
      <PageHeader
        title="Calculadoras"
        subtitle="Capital de giro e ponto de equilíbrio (regras da planilha Donna)"
        actions={
          <Link href="/financeiro" className="btn btn-ghost">
            Tesouraria
          </Link>
        }
      />
      <CalculatorsClient />
    </>
  );
}
