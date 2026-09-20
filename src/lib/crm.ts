/** Preferências CRM em `clients.preferences` — painel Ragnarok (não app paralelo). */

export const CRM_HOW_HEARD = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "indicacao", label: "Indicação" },
  { value: "passou_na_frente", label: "Passou na frente / porta" },
  { value: "parceiro", label: "Parceiro" },
  { value: "qr", label: "QR code" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
] as const;

export type CrmHowHeard = (typeof CRM_HOW_HEARD)[number]["value"];

export const CRM_STATUS = [
  { value: "lead", label: "Lead" },
  { value: "client", label: "Cliente" },
  { value: "lapsed", label: "Sumiu" },
] as const;

export type CrmStatus = (typeof CRM_STATUS)[number]["value"];

/** Etapas do funil (Issue #100 — já tipadas aqui para origem consistente). */
export const CRM_STAGES = [
  { value: "interessado", label: "Interessado" },
  { value: "conversamos", label: "Conversamos" },
  { value: "qualificamos", label: "Qualificamos" },
  { value: "agendou", label: "Agendou" },
  { value: "veio", label: "Veio" },
  { value: "fez_servico", label: "Fez o serviço" },
  { value: "cliente", label: "Cliente" },
] as const;

export type CrmStage = (typeof CRM_STAGES)[number]["value"];

export const CRM_EXITS = [
  { value: "nao_respondeu", label: "Não respondeu" },
  { value: "nao_agendou", label: "Não agendou" },
  { value: "faltou", label: "Faltou" },
  { value: "perdeu", label: "Perdeu" },
] as const;

export type CrmPreferences = {
  howHeard?: string;
  referredBy?: string;
  campaign?: string;
  hairPreference?: string;
  preferredStaffId?: string;
  crmStatus?: CrmStatus | string;
  crmStage?: CrmStage | string;
  crmExit?: string;
  crmExitReason?: string;
  marketingOptIn?: boolean;
  leadSource?: string;
};

export function labelHowHeard(value: string | null | undefined): string {
  if (!value) return "—";
  return CRM_HOW_HEARD.find((o) => o.value === value)?.label ?? value;
}

export function labelCrmStatus(value: string | null | undefined): string {
  if (!value) return "—";
  return CRM_STATUS.find((o) => o.value === value)?.label ?? value;
}

export function labelCrmStage(value: string | null | undefined): string {
  if (!value) return "—";
  return CRM_STAGES.find((o) => o.value === value)?.label ?? value;
}

export function readCrmPreferences(
  prefs: Record<string, unknown> | null | undefined
): CrmPreferences {
  const p = prefs ?? {};
  return {
    howHeard: typeof p.howHeard === "string" ? p.howHeard : undefined,
    referredBy: typeof p.referredBy === "string" ? p.referredBy : undefined,
    campaign: typeof p.campaign === "string" ? p.campaign : undefined,
    hairPreference: typeof p.hairPreference === "string" ? p.hairPreference : undefined,
    preferredStaffId:
      typeof p.preferredStaffId === "string" ? p.preferredStaffId : undefined,
    crmStatus: typeof p.crmStatus === "string" ? p.crmStatus : undefined,
    crmStage: typeof p.crmStage === "string" ? p.crmStage : undefined,
    crmExit: typeof p.crmExit === "string" ? p.crmExit : undefined,
    crmExitReason: typeof p.crmExitReason === "string" ? p.crmExitReason : undefined,
    marketingOptIn: p.marketingOptIn === true,
    leadSource: typeof p.leadSource === "string" ? p.leadSource : undefined,
  };
}
