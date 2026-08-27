export {
  getClientUpsellTips,
  getWeeklyInsights,
  reportPerfil,
  listFollowupsForAgent,
} from "./queries";
export { getManagementDashboard } from "./dashboard";
export { buildOperationalAlerts, isBarCategory } from "./alerts";
export {
  DEFAULT_PRODUCT_REBUY_DAYS,
  DEFAULT_SERVICE_RETURN_DAYS,
  DEFAULT_RECURRENCE_LAPSE_DAYS,
  DEFAULT_INACTIVE_DAYS,
  DEFAULT_INACTIVE_WINDOW_DAYS,
  DEFAULT_ACTIONABLE_WINDOW_DAYS,
} from "./types";
export type {
  ClientUpsellTip,
  FollowUpRow,
  PerfilReport,
  PerfilReofferRow,
  WeeklyInsights,
  OperationalAlert,
  OperationalAlertsReport,
  AlertSeverity,
} from "./types";
export type { ManagementDashboard } from "./dashboard";
