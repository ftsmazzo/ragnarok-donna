import {
  RAGNAROK_BUSINESS_PROFILE,
  readBusinessProfileFromSettings,
} from "@/server/agent/business-profile";

export type TenantBrand = {
  displayName: string;
  tagline: string;
  logoSrc: string | null;
  faviconSrc: string | null;
};

/** Nome/logo para UI — sem o "S" do AppBarber; prioriza businessProfile. */
export function resolveTenantBrand(input: {
  tenantName: string;
  tenantSlug: string;
  settings?: unknown;
}): TenantBrand {
  const profile = readBusinessProfileFromSettings(input.settings);
  const looksRagnarok = /ragnarok/i.test(input.tenantSlug) || /ragnarok/i.test(input.tenantName);

  if (profile) {
    return {
      displayName: profile.nomeFantasia,
      tagline: profile.tagline,
      logoSrc: profile.brand.logoLocalPath ?? profile.brand.logoUrl ?? null,
      faviconSrc: "/branding/ragnarok-app-icon-192.png",
    };
  }

  if (looksRagnarok) {
    const b = RAGNAROK_BUSINESS_PROFILE;
    return {
      displayName: b.nomeFantasia,
      tagline: b.tagline,
      logoSrc: b.brand.logoLocalPath ?? b.brand.logoUrl,
      faviconSrc: "/branding/ragnarok-app-icon-192.png",
    };
  }

  // Limpa possessivo "RagnaroK's" legado se ainda estiver no nome do tenant
  const cleaned = input.tenantName.replace(/RagnaroK'?s?/gi, "Ragnarok").replace(/\s{2,}/g, " ").trim();

  return {
    displayName: cleaned || input.tenantName,
    tagline: "Painel operacional",
    logoSrc: null,
    faviconSrc: null,
  };
}
