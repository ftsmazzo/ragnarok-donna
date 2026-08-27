"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = ["#c45c26", "#1a2226", "#16a34a", "#0ea5e9", "#b45309", "#64748b", "#dc2626"];
const ACCENT = "#c45c26";

type SeriesPoint = { label: string; value: number };
type NamedValue = { name: string; value: number; extra?: number };

function moneyTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <span>
        {v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </span>
    </div>
  );
}

export function RevenueAreaChart({ data }: { data: SeriesPoint[] }) {
  if (!data.length) {
    return <p className="chart-empty">Sem pagamentos no período para montar a série.</p>;
  }
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v) =>
              Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
            }
          />
          <Tooltip content={moneyTooltip} />
          <Area
            type="monotone"
            dataKey="value"
            name="Receita"
            stroke={ACCENT}
            fill="url(#revFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PaymentMixDonut({ data }: { data: NamedValue[] }) {
  if (!data.length) {
    return <p className="chart-empty">Sem mix de pagamento no período.</p>;
  }
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) =>
              Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBarChart({ data }: { data: NamedValue[] }) {
  if (!data.length) {
    return <p className="chart-empty">Sem agendamentos no período.</p>;
  }
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" name="Qtd" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RankingBarChart({
  data,
  valueLabel = "R$",
}: {
  data: NamedValue[];
  valueLabel?: string;
}) {
  if (!data.length) {
    return <p className="chart-empty">Sem dados de ranking no período.</p>;
  }
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, _n, item) => {
              const extra = (item?.payload as NamedValue | undefined)?.extra;
              const money = Number(value).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              });
              return extra != null ? [`${money} · ${extra}x`, valueLabel] : [money, valueLabel];
            }}
          />
          <Bar dataKey="value" fill={ACCENT} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
