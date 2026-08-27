/** @deprecated Fluxo antigo de rewrite — o orquestrador agora é LLM-first com tools. */
export type HumanizeFacts = {
  userText: string;
  draftReply: string;
};

export async function humanizeReply(input: {
  facts: HumanizeFacts;
}): Promise<string> {
  return input.facts.draftReply.trim();
}

export function pickOfferFromHistory(): string | null {
  return null;
}

export function craftPastServiceOffer(input: { offerService: string }): string {
  return input.offerService;
}
