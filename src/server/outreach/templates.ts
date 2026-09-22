/** Placeholders: {{nome}} {{data}} {{hora}} {{profissional}} {{barbearia}} {{desconto}} */

export function renderOutreachTemplate(
  template: string,
  vars: {
    nome?: string | null;
    data?: string | null;
    hora?: string | null;
    profissional?: string | null;
    barbearia?: string | null;
    desconto?: string | number | null;
  }
): string {
  const first = (vars.nome ?? "").trim().split(/\s+/)[0] || "oi";
  const desconto =
    vars.desconto == null || vars.desconto === ""
      ? ""
      : String(vars.desconto);
  return template
    .replaceAll("{{nome}}", first)
    .replaceAll("{{data}}", vars.data?.trim() || "")
    .replaceAll("{{hora}}", vars.hora?.trim() || "")
    .replaceAll("{{profissional}}", vars.profissional?.trim() || "a gente")
    .replaceAll("{{barbearia}}", vars.barbearia?.trim() || "a barbearia")
    .replaceAll("{{desconto}}", desconto)
    .trim();
}

/** Hash estável (FNV-1a 32-bit) — não criptográfico. */
export function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeTemplatePool(
  primary: string,
  variants: string[] | null | undefined,
  fallbackPool: readonly string[]
): string[] {
  const fromSettings = [primary, ...(variants ?? [])]
    .map((t) => t.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const t of fromSettings) {
    if (!unique.includes(t)) unique.push(t);
  }
  if (unique.length >= 2) return unique.slice(0, 5);
  const merged = [...unique];
  for (const t of fallbackPool) {
    if (!merged.includes(t)) merged.push(t);
    if (merged.length >= 4) break;
  }
  return merged.length ? merged : [...fallbackPool];
}

/**
 * Escolhe variante estável no mesmo dayKey; muda entre clientes e no dia seguinte.
 */
export function pickVariantTemplate(input: {
  pool: string[];
  phoneE164: string;
  dayKey: string;
  kind: string;
}): { template: string; variantIndex: number } {
  const pool = input.pool.filter((t) => t.trim());
  if (!pool.length) {
    return { template: "", variantIndex: 0 };
  }
  const idx = stableHash(`${input.phoneE164}|${input.dayKey}|${input.kind}`) % pool.length;
  return { template: pool[idx], variantIndex: idx };
}
