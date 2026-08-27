export const DEFAULT_SERVICE_RETURN_DAYS = 28;
export const DEFAULT_PRODUCT_REBUY_DAYS = 60;

export type UpsellTipKind = "service_due" | "product_due" | "favorite_service";

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
  serviceDue: PerfilReofferRow[];
  productDue: PerfilReofferRow[];
  lowStockCount: number;
  serviceDueCount: number;
  productDueCount: number;
};
