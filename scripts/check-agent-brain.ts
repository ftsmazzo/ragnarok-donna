/**
 * Eval harness do cérebro Donna — short-circuits e política (sem LLM).
 * npm run check:agent-brain
 */
import assert from "node:assert/strict";
import {
  isShortThanks,
  isSoftRefusalOfAlternatives,
  isStrictWaitlistAccept,
  isWaitlistStatusQuestion,
  runtimeRules,
  waitlistOfferReply,
  PREMIUM_ACCEPTANCE,
} from "../src/server/agent/brain-policy";
import { AGENT_TOOL_NAMES } from "../src/server/agent/types";
import { TOOL_CATALOG, SKILL_CATALOG } from "../src/server/agent/catalog";

function hist(...lines: string[]) {
  return lines;
}

// --- Short thanks ---
assert.equal(isShortThanks("obrigado"), true);
assert.equal(isShortThanks("valeu!"), true);
assert.equal(isShortThanks("quero remarcar para amanhã"), false);

// --- Soft refusal → waitlist offer ---
const altHistory = hist(
  "cliente: quero às 15h",
  "donna: Esse horário não está livre. Tenho essas opções:\n1) às 16h com Diego\n2) às 17h com Diogo\nQual dessas funciona?"
);
assert.equal(isSoftRefusalOfAlternatives("depois vejo, obrigado", altHistory), true);
assert.equal(isSoftRefusalOfAlternatives("quero a 1", altHistory), false);
assert.equal(
  isSoftRefusalOfAlternatives("obrigado", hist("cliente: oi", "donna: Olá! Como posso ajudar?")),
  false
);

const offer = waitlistOfferReply();
assert.match(offer, /lista de espera/i);

// --- Strict accept ---
const afterOffer = [
  ...altHistory,
  "cliente: nenhuma",
  `donna: ${offer}`,
];
assert.equal(isStrictWaitlistAccept("sim", afterOffer), true);
assert.equal(isStrictWaitlistAccept("pode confirmar o horário de amanhã?", afterOffer), false);
assert.equal(isStrictWaitlistAccept("sim", altHistory), false);

// --- Status question ---
assert.equal(isWaitlistStatusQuestion("estou na lista?"), true);
assert.equal(isWaitlistStatusQuestion("quero cortar cabelo"), false);

// --- Runtime rules mention reschedule + waitlist ---
const rules = runtimeRules("RagnaroK", "Donna", "+5517999999999", "curta");
assert.match(rules, /reschedule_appointment/);
assert.match(rules, /lista de espera/i);
assert.match(rules, /Nunca invente/i);

// --- Catalog includes reschedule ---
assert.ok(AGENT_TOOL_NAMES.includes("reschedule_appointment"));
assert.ok(TOOL_CATALOG.some((t) => t.name === "reschedule_appointment"));
const schedule = SKILL_CATALOG.find((s) => s.name === "skill.schedule");
assert.ok(schedule?.tools.includes("reschedule_appointment"));

assert.ok(PREMIUM_ACCEPTANCE.length >= 4);

console.log("check:agent-brain OK", {
  tools: AGENT_TOOL_NAMES.length,
  premium: PREMIUM_ACCEPTANCE.length,
});
