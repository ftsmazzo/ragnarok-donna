export const DEFAULT_SERVICE_RETURN_DAYS = 60;
export const DEFAULT_PRODUCT_REBUY_DAYS = 60;
/** Cliente teve serviço de categoria Recorrência e não renovou após este prazo. */
export const DEFAULT_RECURRENCE_LAPSE_DAYS = 45;
/** Cliente sem visita/comanda há este prazo → follow-up de retorno. */
export const DEFAULT_INACTIVE_DAYS = 60;

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

export type PerfilReport = {
  serviceThresholdDays: number;
  productThresholdDays: number;
  recurrenceLapseDays: number;
  inactiveDays: number;
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
