/**
 * Gate do catálogo de suporte (onda 3).
 * Uso: npx tsx scripts/check-support-guides.ts
 */
import { listNavHrefs } from "../src/components/shell/nav";
import { SUPPORT_GUIDES } from "../src/content/support/guides/index";

const MIN_STEPS_READY = 3;
const MIN_OBJECTIONS_READY = 1;

const errors: string[] = [];
const warnings: string[] = [];

const navHrefs = new Set(listNavHrefs());
const byId = new Map(SUPPORT_GUIDES.map((g) => [g.id, g]));

if (byId.size !== SUPPORT_GUIDES.length) {
  const seen = new Set<string>();
  for (const g of SUPPORT_GUIDES) {
    if (seen.has(g.id)) errors.push(`id duplicado: ${g.id}`);
    seen.add(g.id);
  }
}

for (const g of SUPPORT_GUIDES) {
  const label = `${g.id} (${g.status})`;

  if (!g.href?.startsWith("/")) {
    errors.push(`${label}: href inválido "${g.href}"`);
  } else if (!navHrefs.has(g.href)) {
    errors.push(`${label}: href "${g.href}" não está em nav.ts (NAV)`);
  }

  if (!g.menuPath?.trim()) {
    errors.push(`${label}: menuPath vazio`);
  }
  if (!g.summary?.trim()) {
    errors.push(`${label}: summary vazio`);
  }
  if (!g.aliases?.length) {
    warnings.push(`${label}: sem aliases`);
  }
  if (!g.roles?.length) {
    errors.push(`${label}: roles vazio`);
  }

  for (const rel of g.relatedGuideIds ?? []) {
    if (!byId.has(rel)) {
      errors.push(`${label}: relatedGuideIds aponta para id inexistente "${rel}"`);
    }
  }

  if (g.status === "ready" || g.status === "draft") {
    if (g.steps.length < MIN_STEPS_READY) {
      errors.push(
        `${label}: precisa de ≥${MIN_STEPS_READY} steps (tem ${g.steps.length})`
      );
    }
    for (const [i, step] of g.steps.entries()) {
      if (!step.title?.trim() || !step.detail?.trim()) {
        errors.push(`${label}: step[${i}] sem title/detail`);
      }
    }
  }

  if (g.status === "ready") {
    if (g.objections.length < MIN_OBJECTIONS_READY) {
      errors.push(
        `${label}: ready precisa de ≥${MIN_OBJECTIONS_READY} objection (tem ${g.objections.length})`
      );
    }
    for (const [i, o] of g.objections.entries()) {
      if (!o.concern?.trim() || !o.reply?.trim()) {
        errors.push(`${label}: objection[${i}] sem concern/reply`);
      }
    }
    if (!g.lastVerified) {
      warnings.push(`${label}: ready sem lastVerified`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      guides: SUPPORT_GUIDES.length,
      navHrefs: navHrefs.size,
      minStepsReady: MIN_STEPS_READY,
      errors: errors.length,
      warnings: warnings.length,
    },
    null,
    2
  )
);

if (warnings.length) {
  console.warn("warnings:\n- " + warnings.join("\n- "));
}
if (errors.length) {
  console.error("errors:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("ok: support guides");
