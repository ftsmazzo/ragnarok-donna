import { listNavLinks, type NavLink } from "@/components/shell/nav";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stashMarkdown(text: string): { text: string; stash: string[] } {
  const stash: string[] = [];
  const next = text.replace(/\[[^\]]+\]\([^)]+\)/g, (m) => {
    stash.push(m);
    return `\0${stash.length - 1}\0`;
  });
  return { text: next, stash };
}

function restoreMarkdown(text: string, stash: string[]): string {
  return text.replace(/\0(\d+)\0/g, (_, i) => stash[Number(i)] ?? "");
}

function uniqueShortLabels(): Set<string> {
  const counts = new Map<string, number>();
  for (const l of listNavLinks()) {
    counts.set(l.label, (counts.get(l.label) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n === 1).map(([k]) => k));
}

function linksForReplace(): NavLink[] {
  const unique = uniqueShortLabels();
  return listNavLinks()
    .map((l) => ({
      ...l,
      phrases: l.phrases
        .filter((p) => p.includes("→") || p.includes("->") || unique.has(p))
        .sort((a, b) => b.length - a.length),
    }))
    .sort((a, b) => (b.phrases[0]?.length ?? 0) - (a.phrases[0]?.length ?? 0));
}

function placeholder(stash: string[], markdown: string): string {
  stash.push(markdown);
  return `\0${stash.length - 1}\0`;
}

/**
 * Transforma nomes de tela e /rotas em Markdown [Texto](/rota)
 * para o chat renderizar como link com rótulo.
 */
export function linkifySupportReply(text: string): string {
  if (!text.trim()) return text;

  let { text: out, stash } = stashMarkdown(text);

  for (const link of linksForReplace()) {
    const md = `[${link.label}](${link.href})`;
    for (const phrase of link.phrases) {
      if (phrase.length < 3) continue;
      const re = new RegExp(escapeRegExp(phrase), "g");
      out = out.replace(re, () => placeholder(stash, md));
    }
  }

  const valid = new Map(listNavLinks().map((l) => [l.href, l.label]));
  out = out.replace(/\/[a-z][\w\-]*(?:\/[\w\-]+)?/gi, (raw) => {
    const label = valid.get(raw);
    if (!label) return raw;
    return placeholder(stash, `[${label}](${raw})`);
  });

  return restoreMarkdown(out, stash);
}

export function isSupportNavHref(href: string): boolean {
  return listNavLinks().some((l) => l.href === href);
}
