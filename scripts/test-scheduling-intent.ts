/**
 * Regressão P0 agenda — rodar: npx --yes tsx scripts/test-scheduling-intent.ts
 * now fixo: 2026-09-14 (segunda) → próximo sábado = 19/09; 26/09 = sábado seguinte.
 */
import {
  applySchedulingIntentToToolArgs,
  extractSchedulingIntent,
  isWeekdayOnlyPhrase,
} from "../src/server/agent/scheduling-intent";
import { resolveTemporalPhrase } from "../src/server/agent/temporal";

const NOW = new Date("2026-09-14T15:00:00-03:00");

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

// temporal
assert(resolveTemporalPhrase("sábado", NOW)?.date === "2026-09-19", 'só "sábado" → 19/09');
assert(
  resolveTemporalPhrase("sábado dia 26/09", NOW)?.date === "2026-09-26",
  '"sábado dia 26/09" → 26/09'
);
assert(resolveTemporalPhrase("26/09", NOW)?.date === "2026-09-26", '"26/09" → 26/09');

// intent
const bare = extractSchedulingIntent("sábado", { now: NOW });
assert(bare.date === "2026-09-19", "intent sábado → 19/09");
assert(!bare.absoluteDatePresent, "intent sábado sem absoluto");

const printMsg = extractSchedulingIntent(
  "Quais os horários do Luciano sábado dia 26/09",
  { now: NOW }
);
assert(printMsg.date === "2026-09-26", "intent print → 26/09");
assert(printMsg.absoluteDatePresent, "intent print tem absoluto");
assert(/luciano/i.test(printMsg.staffName ?? ""), "intent print extrai Luciano");

// gate: LLM errou com 19/09
const forced = applySchedulingIntentToToolArgs(
  "list_slots",
  { date: "2026-09-19", datePhrase: "sábado", staffName: "Luciano" },
  printMsg
);
assert(forced.date === "2026-09-26", "gate força date 26/09 sobre LLM 19/09");
assert(
  String(forced.datePhrase).includes("26/09"),
  "gate força datePhrase com 26/09"
);

assert(isWeekdayOnlyPhrase("sábado"), "isWeekdayOnlyPhrase sábado");
assert(!isWeekdayOnlyPhrase("sábado dia 26/09"), "não é weekday-only com DD/MM");

console.log("\nAll scheduling-intent regressions passed.");
