import {
  DONNA_ELEGANT_BUSINESS_PROFILE,
  RAGNAROK_BUSINESS_PROFILE,
  readBusinessProfileFromSettings,
} from "@/server/agent/business-profile";

export type TenantBrand = {
  displayName: string;
  tagline: string;
  logoSrc: string | null;
  faviconSrc: string | null;
  themeClass: string | null;
};

/** Classe CSS no app-shell para cores/tipografia da marca. */
export function resolveTenantThemeClass(tenantSlug: string): string | null {
  if (/donna/i.test(tenantSlug)) return "theme-donna-elegant";
  if (/ragnarok/i.test(tenantSlug)) return "theme-ragnaroks";
  return null;
}

/** Nome/logo para UI — sem o "S" do AppBarber; prioriza businessProfile. */
export function resolveTenantBrand(input: {
  tenantName: string;
  tenantSlug: string;
  settings?: unknown;
}): TenantBrand {
  const profile = readBusinessProfileFromSettings(input.settings);
  const looksRagnarok = /ragnarok/i.test(input.tenantSlug) || /ragnarok/i.test(input.tenantName);
  const looksDonna = /donna/i.test(input.tenantSlug) || /donna/i.test(input.tenantName);

  if (profile) {
    return {
      displayName: profile.nomeFantasia,
      tagline: profile.tagline,
      logoSrc: profile.brand.logoLocalPath ?? profile.brand.logoUrl ?? null,
      faviconSrc: looksDonna
        ? "/branding/donna-elegant-logo.png"
        : "/branding/ragnarok-app-icon-192.png",
      themeClass: resolveTenantThemeClass(input.tenantSlug),
    };
  }

  if (looksDonna) {
    const b = DONNA_ELEGANT_BUSINESS_PROFILE;
    return {
      displayName: b.nomeFantasia,
      tagline: b.tagline,
      logoSrc: b.brand.logoLocalPath ?? b.brand.logoUrl,
      faviconSrc: "/branding/donna-elegant-logo.png",
      themeClass: "theme-donna-elegant",
    };
  }

  if (looksRagnarok) {
    const b = RAGNAROK_BUSINESS_PROFILE;
    return {
      displayName: b.nomeFantasia,
      tagline: b.tagline,
      logoSrc: b.brand.logoLocalPath ?? b.brand.logoUrl,
      faviconSrc: "/branding/ragnarok-app-icon-192.png",
      themeClass: "theme-ragnaroks",
    };
  }

  // Limpa possessivo "RagnaroK's" legado se ainda estiver no nome do tenant
  const cleaned = input.tenantName.replace(/RagnaroK'?s?/gi, "Ragnarok").replace(/\s{2,}/g, " ").trim();

  return {
    displayName: cleaned || input.tenantName,
    tagline: "Painel operacional",
    logoSrc: null,
    faviconSrc: null,
    themeClass: resolveTenantThemeClass(input.tenantSlug),
  };
}
