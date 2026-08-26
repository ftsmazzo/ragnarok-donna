/** Formata centavos → R$ 1.234,56 */
export function formatMoney(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 4000 → 40% */
export function formatCommission(bps: number | null | undefined): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(0)}%`;
}

export function formatDuration(min: number | null | undefined): string {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return phone;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
