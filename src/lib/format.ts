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

const ORDER_STATUS: Record<string, string> = {
  open: "Aberta",
  closed: "Fechada",
  cancelled: "Cancelada",
};

const APPT_STATUS: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  arrived: "Chegou",
  in_progress: "Em atendimento",
  completed: "Realizado",
  cancelled: "Cancelado",
  no_show: "Ausente",
  blocked: "Bloqueio",
};

const PAYMENT_METHOD: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  debit: "Débito",
  credit: "Crédito",
  transfer: "Transferência",
  other: "Outro",
};

export function labelOrderStatus(status: string): string {
  return ORDER_STATUS[status] ?? status;
}

export function labelApptStatus(status: string): string {
  return APPT_STATUS[status] ?? status;
}

export function labelPaymentMethod(method: string): string {
  return PAYMENT_METHOD[method] ?? method;
}

const ITEM_TYPE: Record<string, string> = {
  service: "Serviço",
  product: "Produto",
  package: "Pacote",
};

export function labelItemType(type: string): string {
  return ITEM_TYPE[type] ?? type;
}

const ADVANCE_KIND: Record<string, string> = {
  vale: "Vale / adiantamento",
  bonus: "Bonificação",
  discount: "Desconto",
  payout: "Pagamento de comissão",
};

export function labelAdvanceKind(kind: string): string {
  return ADVANCE_KIND[kind] ?? kind;
}

const WAITLIST_STATUS: Record<string, string> = {
  waiting: "Aguardando",
  notified: "Notificado",
};

export function labelWaitlistStatus(status: string): string {
  return WAITLIST_STATUS[status] ?? status;
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? String(weekday);
}
