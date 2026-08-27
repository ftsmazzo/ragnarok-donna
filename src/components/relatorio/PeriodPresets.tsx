import Link from "next/link";

type Props = {
  basePath: string;
  period: "week" | "month" | "custom";
  from: string;
  to: string;
  extraParams?: Record<string, string | undefined>;
};

function hrefFor(
  basePath: string,
  period: string,
  from: string,
  to: string,
  extra?: Record<string, string | undefined>
) {
  const sp = new URLSearchParams();
  sp.set("period", period);
  sp.set("from", from);
  sp.set("to", to);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) sp.set(k, v);
    }
  }
  return `${basePath}?${sp.toString()}`;
}

/** Presets Esta semana / Este mês para relatórios. */
export function PeriodPresets({ basePath, period, from, to, extraParams }: Props) {
  const weekHref = hrefFor(basePath, "week", from, to, { ...extraParams, period: "week" });
  // period=week will be resolved server-side; links just set period flag
  const weekOnly = `${basePath}?period=week${extraQuery(extraParams)}`;
  const monthOnly = `${basePath}?period=month${extraQuery(extraParams)}`;

  void weekHref;
  void from;
  void to;

  return (
    <div className="period-presets" role="group" aria-label="Período">
      <Link
        href={weekOnly}
        className={`btn btn-outline btn-sm${period === "week" ? " is-active" : ""}`}
      >
        Esta semana
      </Link>
      <Link
        href={monthOnly}
        className={`btn btn-outline btn-sm${period === "month" ? " is-active" : ""}`}
      >
        Este mês
      </Link>
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
