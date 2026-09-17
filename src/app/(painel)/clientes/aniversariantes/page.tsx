import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { BirthdayClientsClient } from "@/components/clients/BirthdayClientsClient";
import { listBirthdayClients } from "@/server/clients/birthdays";
import { requirePageAccess } from "@/server/permissions/page-access";
import { formatPhone } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function AniversariantesPage({ searchParams }: Props) {
  const sp = await searchParams;
  await requirePageAccess("/clientes/aniversariantes", sp);
  const range = sp.range === "week" ? "week" : "today";
  const data = await listBirthdayClients({ range });

  return (
    <>
      <PageHeader
        title="Aniversariantes"
        subtitle={
          range === "today"
            ? "Clientes com aniversário hoje"
            : "Próximos 7 dias (incluindo hoje)"
        }
        actions={
          <Link href="/configuracoes/disparos" className="btn btn-outline">
            Template WhatsApp
          </Link>
        }
      />

      <section className="panel">
        <div className="panel-toolbar" style={{ gap: 8 }}>
          <Link
            href="/clientes/aniversariantes?range=today"
            className={`btn btn-outline btn-sm${range === "today" ? " is-active" : ""}`}
          >
            Hoje
          </Link>
          <Link
            href="/clientes/aniversariantes?range=week"
            className={`btn btn-outline btn-sm${range === "week" ? " is-active" : ""}`}
          >
            7 dias
          </Link>
          <span className="meta-label" style={{ marginLeft: "auto" }}>
            Desconto padrão: {data.discountPct}%
          </span>
        </div>

        <BirthdayClientsClient
          rows={data.rows.map((r) => ({
            ...r,
            phoneLabel: formatPhone(r.phone ?? r.phoneE164),
          }))}
          discountPct={data.discountPct}
        />
      </section>
    </>
  );
}
