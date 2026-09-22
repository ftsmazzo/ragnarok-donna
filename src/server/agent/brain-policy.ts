/**
 * Política do cérebro Donna — short-circuits e regras de runtime.
 * Fonte única para orquestrador + eval harness.
 */
import type { ReplyLength } from "./persona";
import { replyLengthInstruction } from "./persona";

export function isShortThanks(text: string): boolean {
  const t = text.trim();
  if (t.length > 40) return false;
  return /^(obrigad[oa]|valeu|vlw|ok|obrigado[!.]?|thanks|tmj|fechado|show)([!.?\s]|$)/i.test(
    t
  );
}

export function lastDonnaMessage(history: string[]): string | null {
  return [...history].reverse().find((h) => h.startsWith("donna:")) ?? null;
}

export function donnaOfferedAlternatives(donnaBody: string): boolean {
  if (/(opções|opcoes) pra|tenho essas opções|Qual (dessas|funciona)/i.test(donnaBody)) {
    return true;
  }
  const hasSlots = /(às|as) \d{1,2}h com/i.test(donnaBody);
  const hasList = /(?:^|\n)\s*(?:[123][\.\)]|1️⃣|2️⃣|3️⃣)/m.test(donnaBody);
  return hasSlots && hasList;
}

export function waitlistAlreadyOffered(history: string[]): boolean {
  return history.some(
    (h) =>
      h.startsWith("donna:") &&
      /lista de espera|te coloco na espera|na espera do horário|te aviso se liberar|me avisa se liberar/i.test(
        h
      )
  );
}

export function userPickedAlternative(text: string): boolean {
  const t = text.trim();
  if (/^(a\s*)?[123]([.\)]|\s|$)/i.test(t)) return true;
  if (/\b(primeira|segunda|terceira)\s*(opção|opcao)?\b/i.test(t)) return true;
  if (/\b(quero|vou|fico|pode)\b.{0,20}\b(com o|com a|às|as)\b/i.test(t)) return true;
  if (/\b(diogo|diego|barba|corte)\b/i.test(t) && /\b(\d{1,2})\s*h?\b/i.test(t)) return true;
  return false;
}

export function userWantsWaitlist(text: string): boolean {
  return /lista de espera|me avisa se liberar|coloca na espera|quero a espera|pode me colocar na espera|entra na espera|me coloca na lista/i.test(
    text
  );
}

/** Aceite curto da oferta de espera — NÃO "pode confirmar", "pode ser amanhã", etc. */
export function isStrictWaitlistAccept(text: string, history: string[]): boolean {
  if (!waitlistAlreadyOffered(history)) return false;
  const last = lastDonnaMessage(history) || "";
  if (
    !/quer que eu te coloque na lista|lista de espera do horário|te aviso se liberar|te aviso aqui no Zap\?/i.test(
      last
    )
  ) {
    return false;
  }
  if (/Pronto, você está na lista/i.test(last)) return false;

  const t = text.trim();
  if (t.length > 48) return false;
  if (/confirm|hora|dia|quando|onde|qual|lista\?|estou|tô na|to na/i.test(t)) return false;
  if (/^(sim|quero|pode|ok|fechado|isso|uhum|pode ser|pode colocar|coloca)([!.?\s]|$)/i.test(t)) {
    return true;
  }
  return false;
}

export function isWaitlistStatusQuestion(userText: string): boolean {
  return /estou na lista|tô na lista|to na lista|entrei na lista|já estou na|ja estou na|confirma.*(lista|espera)|ainda (estou|tô|to) na lista|pode confirmar\??\s*$/i.test(
    userText
  );
}

/**
 * Recusa suave das alternativas → oferta de espera.
 * Exige que a Donna tenha oferecido alternativas (ou recusa explícita forte).
 */
export function isSoftRefusalOfAlternatives(
  userText: string,
  history: string[]
): boolean {
  if (userWantsWaitlist(userText)) return false;
  if (waitlistAlreadyOffered(history)) return false;
  if (userPickedAlternative(userText)) return false;

  const last = lastDonnaMessage(history) || "";
  const offeredAlts = donnaOfferedAlternatives(last);
  const strongRefusal =
    /depois vejo|vejo depois|deixa pra lá|deixa pra la|não me interessa|nao me interessa|nenhuma serve|não serve nenhuma|nao serve nenhuma/i.test(
      userText
    );

  if (!offeredAlts && !strongRefusal) return false;

  return /depois vejo|vejo depois|deixa|mais tarde|outra hora|outro dia|não me interessa|nao me interessa|nenhuma|não quero|nao quero|não serve|nao serve|pode deixar|deixa quieto|não precisa|nao precisa|não\.?\s*obrigad|nao\.?\s*obrigad|obrigad|valeu|vlw|blz|beleza|tá bom|ta bom|tudo bem|tenha uma|ótima tarde|otima tarde|até mais|ate mais|falou|flw/i.test(
    userText
  );
}

export function waitlistOfferReply(): string {
  return "Sem problema! Antes de encerrar: quer que eu te coloque na lista de espera do horário que você pediu? Se liberar, te aviso aqui no Zap.";
}

export function waitlistConfirmReply(detail: string): string {
  return `Pronto, você está na lista de espera${detail ? ` ${detail}` : ""}! Se liberar, te chamo aqui no Zap.`;
}

export function waitlistFailReply(): string {
  return "Quase consegui te colocar na espera — me confirma rapidinho o horário e o profissional que você queria?";
}

/** Regras fortes — fluxo detalhado fica nos SKILL_PLAYBOOKS (não duplicar). */
export function runtimeRules(
  businessName: string,
  displayName: string,
  phoneE164: string,
  replyLength: ReplyLength
): string {
  return `
Você é ${displayName}, recepção da ${businessName}, no WhatsApp.
Timezone: America/Sao_Paulo. Telefone desta conversa: ${phoneE164}.

REGRAS (obrigatórias):
1. Responda a pergunta real. Use SKILLS/TOOLS antes de afirmar agenda, preço, histórico ou disponibilidade.
2. Em find_client / list_client_appointments use o telefone acima se faltar argumento.
3. Nunca invente horário, produto, preço ou dia da semana — use label/dateBr/weekday das tools. Datas: frase LITERAL do cliente para resolve_date/list_slots.
4. ${replyLengthInstruction(replyLength)} Texto final = só WhatsApp (sem markdown). Nunca diga que é IA/bot.
5. Cadência de agendamento: serviço (se faltar) → data → list_slots → confirme UMA vez → book_appointment. Depois do book, se o cliente só agradecer, não reconfirme.
6. Remarcação: prefira reschedule_appointment (atômico). Só use cancel+book se a tool de remarcar não estiver disponível.
7. Horário ocupado (staffDayFull / preferredHourOccupied sem slots): 2–3 alternativas curtas; se recusar → lista de espera; se recusar a espera → handoff_human. Se slots.length>0, NÃO diga que está cheio.
8. Lista de espera: add_to_waitlist com o telefone da conversa. NUNCA handoff_human por sucesso/falha da espera.
9. Encaixe/agora: não sobrepõe agenda — próximo slot livre ou handoff. "Cheguei" com horário hoje = check-in (já tratado pelo sistema), não encaixe.
10. Barbeiro fixado pelo cliente: list_slots só dele; mostre 2–3 próximos; sem menu abstrato de caminhos.
`.trim();
}

export const PREMIUM_ACCEPTANCE = [
  "zero_inventario_horario_ou_weekday",
  "waitlist_sempre_confirma_ou_erro",
  "remarcacao_atomica_sem_buraco",
  "tom_curto_humano",
  "eval_agent_brain_verde",
] as const;
