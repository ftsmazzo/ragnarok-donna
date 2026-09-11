import { SUPPORT_FAQ, type SupportFaqEntry } from "@/content/support/faq";
import { FEATURE_HINTS, type FeatureHint } from "@/content/support/nav-hints";

export { SUGGESTED_PROMPTS } from "@/content/support/suggestions";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function scoreText(query: string, haystack: string): number {
  const q = normalize(query);
  const h = normalize(haystack);
  if (!q || !h) return 0;
  if (h.includes(q)) return 10;
  const parts = q.split(/\s+/).filter((p) => p.length > 2);
  let score = 0;
  for (const p of parts) {
    if (h.includes(p)) score += 2;
  }
  return score;
}

export function searchHelp(query: string, limit = 4): SupportFaqEntry[] {
  const scored = SUPPORT_FAQ.map((entry) => {
    const score =
      scoreText(query, entry.question) * 3 +
      scoreText(query, entry.answer) +
      entry.tags.reduce((n, t) => n + scoreText(query, t) * 2, 0);
    return { entry, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => x.entry);
}

export function getFeatureHint(query: string): FeatureHint | null {
  const q = normalize(query);
  if (!q) return null;

  let best: { hint: FeatureHint; score: number } | null = null;
  for (const hint of FEATURE_HINTS) {
    let score = scoreText(query, hint.title) * 2;
    for (const alias of hint.aliases) {
      score = Math.max(score, scoreText(query, alias) * 3);
      if (q === normalize(alias)) score = Math.max(score, 20);
    }
    if (!best || score > best.score) best = { hint, score };
  }
  if (!best || best.score < 2) return null;
  return best.hint;
}
