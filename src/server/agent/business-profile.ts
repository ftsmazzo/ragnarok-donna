/**
 * Perfil da unidade — dados institucionais para a Donna informar
 * (endereço, horários, sobre, branding). WhatsApp NÃO fica aqui:
 * vem da conexão Evolution ativa.
 *
 * Fonte Ragnarok: https://www.barbeariaragnarok.com.br/
 */

export type BusinessHoursDay = {
  days: string;
  open: string | null;
  close: string | null;
  note?: string;
};

export type BusinessBrand = {
  logoUrl: string;
  /** Cópia local no app (public/) quando disponível */
  logoLocalPath?: string;
  faviconUrl?: string;
  fonts: { display: string; body: string; googleFontsCss: string };
  colors: {
    primary: string;
    dark: string;
    darker: string;
    cream: string;
    muted: string;
    onDark: string;
  };
};

export type BusinessProfile = {
  version: number;
  sourceUrl: string;
  nomeFantasia: string;
  razaoSocialHint?: string;
  tagline: string;
  slogan: string;
  cidade: string;
  estado: string;
  endereco: {
    logradouro: string;
    bairro: string;
    cidade: string;
    uf: string;
    textoCompleto: string;
  };
  email: string | null;
  /** WhatsApp institucional omitido de propósito — usa o número conectado. */
  telefoneFixoHint?: string | null;
  redes: {
    instagram?: string;
    facebook?: string;
    youtube?: string;
  };
  avaliacaoGoogle?: { nota: number; texto: string };
  desdeAno?: number;
  diferenciais: string[];
  sobre: string[];
  servicosSite: string[];
  horarios: BusinessHoursDay[];
  brand: BusinessBrand;
};

/** Identidade e dados captados do site oficial (sem WhatsApp). */
export const RAGNAROK_BUSINESS_PROFILE: BusinessProfile = {
  version: 1,
  sourceUrl: "https://www.barbeariaragnarok.com.br/",
  nomeFantasia: "Barbearia Ragnarok",
  tagline: "Imagem Masculina",
  slogan: "Total na Sua Imagem.",
  cidade: "Catanduva",
  estado: "SP",
  endereco: {
    logradouro: "Rua Curitiba, 465",
    bairro: "Vila Motta",
    cidade: "Catanduva",
    uf: "SP",
    textoCompleto: "Rua Curitiba, 465 - Vila Motta, Catanduva/SP",
  },
  email: "contato@barbeariaragnarok.com.br",
  telefoneFixoHint: null,
  redes: {
    instagram: "https://www.instagram.com/barbeariaragnarok/",
    facebook: "https://facebook.com/barbeariaragnarokcatanduva",
    youtube: "https://youtube.com/@barbeariaragnarok",
  },
  avaliacaoGoogle: {
    nota: 5,
    texto: "5,0 no Google",
  },
  desdeAno: 2019,
  diferenciais: [
    "Atendimento com horário marcado — sem fila, sem furo",
    "Ambiente climatizado e organizado",
    "Visagismo e corte estratégico no formato do rosto",
    "Barba com navalha, lâmina de alta performance e toalha quente",
    "Equipe com domínio de corte clássico e moderno",
    "Consultoria de imagem masculina",
  ],
  sobre: [
    "Desde 2019 elevando o nível em Catanduva.",
    "Estrutura profissional, pontualidade e organização.",
    "Aqui o cliente paga pela qualidade do corte e pelo conforto.",
    "Barbearia em Catanduva focada em corte e barba sem espera.",
  ],
  servicosSite: [
    "Corte",
    "Barba",
    "Pezinho",
    "Redutor de volume",
    "Hidratação",
    "Hidratação de barba",
    "Depilação",
    "Sobrancelhas",
    "Luzes",
    "Limpeza de pele",
    "Tintura",
    "Pigmentação de barba",
  ],
  horarios: [
    { days: "Segunda", open: "10:30", close: "19:00" },
    { days: "Terça a Quinta", open: "09:00", close: "19:00" },
    { days: "Sexta", open: "08:00", close: "19:00" },
    { days: "Sábado", open: "08:00", close: "18:00" },
    { days: "Domingo e feriado", open: null, close: null, note: "Fechado" },
  ],
  brand: {
    logoUrl:
      "https://www.barbeariaragnarok.com.br/assets/svg/LOGO-BARBEARIA-RAGNAROK-CATANDUVA-SP.svg",
    logoLocalPath: "/branding/ragnarok-logo.png",
    faviconUrl: "https://www.barbeariaragnarok.com.br/assets/img/favicon.png",
    fonts: {
      display: "Oswald",
      body: "Rubik",
      googleFontsCss:
        "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Rubik:wght@400;500&display=swap",
    },
    colors: {
      primary: "#735340",
      dark: "#252525",
      darker: "#0d0d0d",
      cream: "#fbf7ee",
      muted: "#707070",
      onDark: "#ffffff",
    },
  },
};

export function formatHoursForAgent(hours: BusinessHoursDay[]): string {
  return hours
    .map((h) => {
      if (h.note || !h.open || !h.close) return `${h.days}: ${h.note ?? "Fechado"}`;
      return `${h.days}: ${h.open} às ${h.close}`;
    })
    .join("; ");
}

/** Bloco curto para o system prompt da Donna. */
export function compileBusinessFactsForPrompt(profile: BusinessProfile): string {
  return [
    "DADOS DA UNIDADE (use para perguntas de endereço, horário, sobre a loja — WhatsApp = o número desta conversa):",
    `- Nome: ${profile.nomeFantasia} (${profile.tagline})`,
    `- Slogan: ${profile.slogan}`,
    `- Endereço: ${profile.endereco.textoCompleto}`,
    `- Cidade: ${profile.cidade}/${profile.estado}`,
    profile.email ? `- E-mail: ${profile.email}` : null,
    `- Horários: ${formatHoursForAgent(profile.horarios)}`,
    profile.desdeAno ? `- Desde: ${profile.desdeAno}` : null,
    profile.avaliacaoGoogle ? `- Avaliação: ${profile.avaliacaoGoogle.texto}` : null,
    `- Diferenciais: ${profile.diferenciais.slice(0, 4).join(" · ")}`,
    `- Serviços (catálogo da marca): ${profile.servicosSite.join(", ")}`,
    profile.redes.instagram ? `- Instagram: ${profile.redes.instagram}` : null,
    "Para preço/estoque de produto use list_products; para preço de serviço use list_services; não invente valores.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isBusinessProfile(v: unknown): v is BusinessProfile {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.nomeFantasia === "string" && typeof o.endereco === "object";
}

export function readBusinessProfileFromSettings(settings: unknown): BusinessProfile | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>).businessProfile;
  return isBusinessProfile(raw) ? (raw as BusinessProfile) : null;
}
