import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AppError } from "../src/server/errors";
import {
  HUMAN_HANDOFF_ALREADY_REPLY,
  HUMAN_HANDOFF_ACTIVE_REPLY,
  HUMAN_HANDOFF_PENDING_REPLY,
  HUMAN_HANDOFF_QUEUED_REPLY,
  isSuccessfulHttpStatus,
  publicSupportError,
  toChronologicalOrder,
} from "../src/server/support/reliability";

assert.equal(isSuccessfulHttpStatus(200), true);
assert.equal(isSuccessfulHttpStatus(204), true);
assert.equal(isSuccessfulHttpStatus(299), true);
assert.equal(isSuccessfulHttpStatus(300), false);
assert.equal(isSuccessfulHttpStatus(500), false);

assert.equal(
  publicSupportError(new AppError("VALIDATION", "Mensagem segura")),
  "Mensagem segura"
);
assert.equal(
  publicSupportError(new Error("postgres://credencial-interna"), "Erro público"),
  "Erro público"
);

const recentFirst = Array.from({ length: 200 }, (_, index) => 250 - index);
const chronological = toChronologicalOrder(recentFirst);
assert.equal(chronological.length, 200);
assert.equal(chronological[0], 51);
assert.equal(chronological.at(-1), 250);

for (const reply of [
  HUMAN_HANDOFF_QUEUED_REPLY,
  HUMAN_HANDOFF_ACTIVE_REPLY,
  HUMAN_HANDOFF_ALREADY_REPLY,
]) {
  assert.match(reply, /canal|contato externo/i);
  assert.doesNotMatch(reply, /responde(rá)? por aqui|fila humana/i);
}
assert.match(HUMAN_HANDOFF_PENDING_REPLY, /andamento|aguarde/i);
assert.doesNotMatch(HUMAN_HANDOFF_PENDING_REPLY, /notificad[ao]/i);

const queriesSource = readFileSync(
  new URL("../src/server/support/queries.ts", import.meta.url),
  "utf8"
);
assert.match(queriesSource, /desc\(schema\.supportMessages\.createdAt\)/);
assert.match(queriesSource, /\.limit\(200\)/);
assert.match(queriesSource, /toChronologicalOrder\(recentMessages\)/);

const schemaSource = readFileSync(
  new URL("../src/db/schema/support.ts", import.meta.url),
  "utf8"
);
assert.match(schemaSource, /support_threads_tenant_user_uidx/);
assert.match(schemaSource, /support_messages_thread_request_role_uidx/);

const mutationSource = readFileSync(
  new URL("../src/server/support/mutations.ts", import.meta.url),
  "utf8"
);
assert.match(mutationSource, /AbortSignal\.timeout\(SUPPORT_WEBHOOK_TIMEOUT_MS\)/);
assert.match(mutationSource, /"Idempotency-Key"/);
assert.match(mutationSource, /\.onConflictDoNothing\(\)/);

const widgetSource = readFileSync(
  new URL("../src/components/support/SupportChatWidget.tsx", import.meta.url),
  "utf8"
);
assert.match(widgetSource, /aria-modal="true"/);
assert.match(widgetSource, /aria-labelledby="support-chat-title"/);
assert.match(widgetSource, /role="log"/);
assert.match(widgetSource, /role="alert"/);
assert.match(widgetSource, /Mensagem para o suporte/);
assert.match(widgetSource, /e\.key === "Escape"/);
assert.match(widgetSource, /e\.key !== "Tab"/);
assert.match(widgetSource, /prefers-reduced-motion: reduce/);

const cssSource = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8"
);
assert.match(cssSource, /\.support-chat-fab:focus-visible/);
assert.match(cssSource, /\.support-chat-panel\s*\{\s*animation: none !important;/);

console.log("ok: support reliability");
