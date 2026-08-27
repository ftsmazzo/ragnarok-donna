import { eq } from "drizzle-orm";
import { createDb, schema } from "@/db";
import { requireTenantContext } from "@/server/context/tenant";
import {
  RAGNAROK_BUSINESS_PROFILE,
  readBusinessProfileFromSettings,
  type BusinessHoursDay,
  type BusinessProfile,
} from "@/server/agent/business-profile";

export type EmpresaFormInput = {
  nomeFantasia: string;
  tagline: string;
  slogan: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  telefoneFixoHint: string;
  instagram: string;
  facebook: string;
  youtube: string;
  desdeAno: string;
  diferenciais: string;
  sobre: string;
  servicosSite: string;
  /** Uma linha por dia: "Segunda|10:30|19:00" ou "Domingo|||Fechado" */
  horariosText: string;
};

function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function parseHorarios(text: string, fallback: BusinessHoursDay[]): BusinessHoursDay[] {
  const lines = linesToList(text);
  if (!lines.length) return fallback;
  return lines.map((line) => {
    const [days, open, close, note] = line.split("|").map((p) => p?.trim() ?? "");
    return {
      days: days || "Dia",
      open: open || null,
      close: close || null,
      note: note || undefined,
    };
  });
}

function horariosToText(hours: BusinessHoursDay[]): string {
  return hours
    .map((h) => {
      if (h.note || !h.open || !h.close) {
        return `${h.days}|||${h.note ?? "Fechado"}`;
      }
      return `${h.days}|${h.open}|${h.close}|`;
    })
    .join("\n");
}

export type EmpresaFormView = EmpresaFormInput & {
  hasProfile: boolean;
};

export async function getEmpresaForm(): Promise<EmpresaFormView> {
  const tenant = await requireTenantContext();
  const db = createDb();
  const [row] = await db
    .select({ settings: schema.tenants.settings, name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenant.id))
    .limit(1);

  const profile =
    readBusinessProfileFromSettings(row?.settings) ??
    ({
      ...RAGNAROK_BUSINESS_PROFILE,
      nomeFantasia: row?.name || tenant.name,
      tagline: "",
      slogan: "",
      cidade: "",
      estado: "",
      endereco: {
        logradouro: "",
        bairro: "",
        cidade: "",
        uf: "",
        textoCompleto: "",
      },
      email: null,
      telefoneFixoHint: null,
      redes: {},
      diferenciais: [],
      sobre: [],
      servicosSite: [],
      horarios: RAGNAROK_BUSINESS_PROFILE.horarios,
      brand: RAGNAROK_BUSINESS_PROFILE.brand,
      sourceUrl: "",
      version: 1,
    } satisfies BusinessProfile);

  const hasProfile = Boolean(readBusinessProfileFromSettings(row?.settings));

  return {
    hasProfile,
    nomeFantasia: profile.nomeFantasia,
    tagline: profile.tagline,
    slogan: profile.slogan,
    logradouro: profile.endereco.logradouro,
    bairro: profile.endereco.bairro,
    cidade: profile.endereco.cidade || profile.cidade,
    uf: profile.endereco.uf || profile.estado,
    email: profile.email ?? "",
    telefoneFixoHint: profile.telefoneFixoHint ?? "",
    instagram: profile.redes.instagram ?? "",
    facebook: profile.redes.facebook ?? "",
    youtube: profile.redes.youtube ?? "",
    desdeAno: profile.desdeAno ? String(profile.desdeAno) : "",
    diferenciais: profile.diferenciais.join("\n"),
    sobre: profile.sobre.join("\n"),
    servicosSite: profile.servicosSite.join("\n"),
    horariosText: horariosToText(profile.horarios),
  };
}

/** Salva businessProfile no tenant — a Donna passa a usar no próximo turno. */
export async function saveEmpresaForm(
  input: EmpresaFormInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenant = await requireTenantContext();
  const db = createDb();

  const nomeFantasia = input.nomeFantasia.trim().slice(0, 120);
  if (!nomeFantasia) return { ok: false, error: "Nome fantasia é obrigatório." };

  const cidade = input.cidade.trim().slice(0, 80);
  const uf = input.uf.trim().toUpperCase().slice(0, 2);
  const logradouro = input.logradouro.trim().slice(0, 160);
  const bairro = input.bairro.trim().slice(0, 80);
  const textoCompleto = [logradouro, bairro ? `- ${bairro}` : null, cidade && uf ? `${cidade}/${uf}` : cidade]
    .filter(Boolean)
    .join(", ")
    .replace(" - ,", " -");

  const [row] = await db
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenant.id))
    .limit(1);

  const existing = readBusinessProfileFromSettings(row?.settings);
  const baseBrand = existing?.brand ?? {
    logoUrl: "/branding/ragnarok-favicon.png",
    logoLocalPath: "/branding/ragnarok-favicon.png",
    faviconUrl: "/branding/ragnarok-favicon.png",
    fonts: RAGNAROK_BUSINESS_PROFILE.brand.fonts,
    colors: RAGNAROK_BUSINESS_PROFILE.brand.colors,
  };

  const desdeAnoNum = Number(input.desdeAno);
  const profile: BusinessProfile = {
    version: Math.max(1, Number(existing?.version) || 1),
    sourceUrl: existing?.sourceUrl || "",
    nomeFantasia,
    tagline: input.tagline.trim().slice(0, 80),
    slogan: input.slogan.trim().slice(0, 120),
    cidade,
    estado: uf,
    endereco: {
      logradouro,
      bairro,
      cidade,
      uf,
      textoCompleto: textoCompleto || nomeFantasia,
    },
    email: input.email.trim().slice(0, 160) || null,
    telefoneFixoHint: input.telefoneFixoHint.trim().slice(0, 40) || null,
    redes: {
      instagram: input.instagram.trim().slice(0, 200) || undefined,
      facebook: input.facebook.trim().slice(0, 200) || undefined,
      youtube: input.youtube.trim().slice(0, 200) || undefined,
    },
    avaliacaoGoogle: existing?.avaliacaoGoogle,
    desdeAno: Number.isFinite(desdeAnoNum) && desdeAnoNum > 1900 ? desdeAnoNum : undefined,
    diferenciais: linesToList(input.diferenciais),
    sobre: linesToList(input.sobre),
    servicosSite: linesToList(input.servicosSite),
    horarios: parseHorarios(
      input.horariosText,
      existing?.horarios?.length ? existing.horarios : RAGNAROK_BUSINESS_PROFILE.horarios
    ),
    brand: baseBrand,
  };

  const prev =
    row?.settings && typeof row.settings === "object"
      ? (row.settings as Record<string, unknown>)
      : {};

  await db
    .update(schema.tenants)
    .set({
      name: nomeFantasia,
      settings: {
        ...prev,
        businessProfile: profile,
        branding: profile.brand,
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.tenants.id, tenant.id));

  return { ok: true };
}
