import Link from "next/link";

type PeriodKey = "today" | "last7" | "week" | "last30" | "month" | "custom";

type Props = {
  basePath: string;
  period: PeriodKey;
  from: string;
  to: string;
  extraParams?: Record<string, string | undefined>;
};

/** Presets de período para relatórios (densidade Barber). */
export function PeriodPresets({ basePath, period, extraParams }: Props) {
  const presets: { key: PeriodKey; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "last7", label: "7 dias" },
    { key: "week", label: "Esta semana" },
    { key: "last30", label: "30 dias" },
    { key: "month", label: "Este mês" },
  ];

  return (
    <div className="period-presets" role="group" aria-label="Período">
      {presets.map((p) => (
        <Link
          key={p.key}
          href={`${basePath}?period=${p.key}${extraQuery(extraParams)}`}
          className={`btn btn-outline btn-sm${period === p.key ? " is-active" : ""}`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}

function extraQuery(extra?: Record<string, string | undefined>) {
  if (!extra) return "";
  const parts = Object.entries(extra)
    .filter(([k, v]) => v && k !== "period" && k !== "from" && k !== "to")
    .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v!)}`);
  return parts.join("");
}
