/** Canal real de handoff humano do suporte do painel. */
export function supportHumanChannelConfigured(): boolean {
  return Boolean(process.env.SUPPORT_HANDOFF_WEBHOOK_URL?.trim());
}

export function supportHumanContactHint(): string | null {
  const raw = process.env.SUPPORT_HUMAN_CONTACT?.trim();
  return raw || null;
}
