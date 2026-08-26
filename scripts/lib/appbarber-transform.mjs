/** Transformações AppBarber → nosso schema */

export function parseMoney(v) {
  if (v == null || v === "") return 0;
  let s = String(v).replace(/R\$\s?/g, "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function parseCommissionBps(v) {
  if (!v) return null;
  const s = String(v).replace("%", "").replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function parseDateBr(v) {
  if (!v) return null;
  const m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", min = "00"] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00-03:00`);
}

export function phoneE164(ddi, phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;
  const prefix = String(ddi || "55").replace(/\D/g, "") || "55";
  return `+${prefix}${digits}`;
}

export function cleanStr(v, max = 160) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function mapAppointmentStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("realiz")) return "completed";
  if (s.includes("confirm")) return "confirmed";
  if (s.includes("ausen")) return "no_show";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("bloq")) return "blocked";
  return "scheduled";
}

export function mapOrderStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s.includes("fech")) return "closed";
  if (s.includes("cancel")) return "cancelled";
  return "open";
}

export function mapPaymentMethod(tipo) {
  const s = String(tipo || "").toLowerCase();
  if (!s) return "other";
  if (s.includes("pix")) return "pix";
  if (s.includes("dinheiro")) return "cash";
  if (s.includes("débito") || s.includes("debito")) return "debit";
  if (s.includes("crédito") || s.includes("credito")) return "credit";
  if (s.includes("transfer")) return "transfer";
  return "other";
}

export function mapOrderItemType(tipo) {
  return String(tipo) === "0" ? "product" : "service";
}
