export const DEFAULT_SERVICE_RETURN_DAYS = 60;
export const DEFAULT_PRODUCT_REBUY_DAYS = 60;
/** Cliente teve serviço de categoria Recorrência e não renovou após este prazo. */
export const DEFAULT_RECURRENCE_LAPSE_DAYS = 45;
/** Sem serviço/visita há este prazo → candidato a retorno. */
export const DEFAULT_INACTIVE_DAYS = 60;
/**
 * Janela máxima (saudável) para qualquer alerta de ação.
 * Cadastros parados (anos sem vir) ficam de fora.
 */
export const DEFAULT_ACTIONABLE_WINDOW_DAYS = 100;
/**
 * Janela máxima (saudável): só quem ainda “sumiu recente”.
 * last_visit entre inactiveDays e inactiveWindowDays atrás.
 */
export const DEFAULT_INACTIVE_WINDOW_DAYS = DEFAULT_ACTIONABLE_WINDOW_DAYS;

export type UpsellTipKind =
  | "service_due"
  | "product_due"
  | "favorite_service"
  | "recurrence_lapsed"
  | "inactive_return";

export type ClientUpsellTip = {
  kind: UpsellTipKind;
  title: string;
  detail: string;
  daysSince: number | null;
  catalogId: string | null;
  catalogName: string;
};

export type PerfilReofferRow = {
  clientId: string;
  clientName: string;
  phone: string | null;
  catalogId: string;
  catalogName: string;
  lastAt: Date;
  daysSince: number;
  thresholdDays: number;
};

export type FollowUpRow = {
  clientId: string;
  clientName: string;
  phone: string | null;
  lastAt: Date;
  daysSince: number;
  thresholdDays: number;
  /** Último serviço/motivo para personalizar a mensagem */
  lastServiceName: string | null;
  reason: "inactive" | "recurrence_lapsed";
};

export type WeeklyInsightCard = {
  id: string;
  label: string;
  value: number;
  hint: string;
  href: string;
};

export type WeeklyInsights = {
  cards: WeeklyInsightCard[];
  tips: string[];
};

export type AlertSeverity = "critical" | "warning" | "info";

export type OperationalAlertKind =
  | "stock_low_shop"
  | "stock_low_bar"
  | "cancellations_week"
  | "renewals_week"
  | "returned_lost_week"
  | "open_orders_stale";

export type OperationalAlert = {
  id: string;
  severity: AlertSeverity;
  kind: OperationalAlertKind;
  title: string;
  detail: string;
  count: number;
  href: string;
  periodLabel: string;
};

export type OperationalAlertsReport = {
  generatedAt: string;
  weekFrom: string;
  weekTo: string;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
    lowStockShop: number;
    lowStockBar: number;
    cancellationsWeek: number;
    cancelRatePct: number;
    appointmentsWeek: number;
    renewalsWeek: number;
    returnedLostWeek: number;
  };
  alerts: OperationalAlert[];
  returnedClients: { clientId: string; clientName: string; phone: string | null; gapDays: number }[];
  renewalClients: { clientId: string; clientName: string; phone: string | null; gapDays: number }[];
};

export type PerfilReport = {
  serviceThresholdDays: number;
  productThresholdDays: number;
  recurrenceLapseDays: number;
  inactiveDays: number;
  inactiveWindowDays: number;
  serviceDue: PerfilReofferRow[];
  productDue: PerfilReofferRow[];
  recurrenceLapsed: FollowUpRow[];
  inactiveClients: FollowUpRow[];
  lowStockCount: number;
  serviceDueCount: number;
  productDueCount: number;
  recurrenceLapsedCount: number;
  inactiveCount: number;
};
