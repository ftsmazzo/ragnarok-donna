import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateAccountSettlement,
  discountKeepsSettledAmount,
} from "../src/server/clients/account-reliability";

assert.deepEqual(calculateAccountSettlement(10_000, 4_000), {
  amountCents: 10_000,
  creditAppliedCents: 4_000,
  debtCents: 6_000,
  accountDeltaCents: -10_000,
});
assert.deepEqual(calculateAccountSettlement(5_000, 8_000), {
  amountCents: 5_000,
  creditAppliedCents: 5_000,
  debtCents: 0,
  accountDeltaCents: -5_000,
});
assert.equal(
  discountKeepsSettledAmount({
    totalCents: 10_000,
    discountCents: 2_000,
    paidCents: 5_000,
    debtCents: 3_000,
  }),
  true
);
assert.equal(
  discountKeepsSettledAmount({
    totalCents: 10_000,
    discountCents: 2_001,
    paidCents: 5_000,
    debtCents: 3_000,
  }),
  false
);

const root = path.resolve(process.cwd());
const accountSource = fs.readFileSync(
  path.join(root, "src/server/clients/account.ts"),
  "utf8"
);
const orderSource = fs.readFileSync(
  path.join(root, "src/server/orders/mutations.ts"),
  "utf8"
);
const startupSource = fs.readFileSync(
  path.join(root, "scripts/start-production.mjs"),
  "utf8"
);

assert.match(accountSource, /accountBalanceCents:\s*sql`[^`]*\+\s*\$\{delta\}`/);
assert.match(accountSource, /db\.transaction\(\(tx\)\s*=>\s*applyClientAccountDeltaTx/);
assert.match(orderSource, /\.for\("update"\)/);
assert.match(orderSource, /eq\(schema\.orders\.status,\s*"open"\)/);
assert.match(startupSource, /await withTimeout\(ensureRequiredAccountSchema\(\)/);

console.log("ok: client account reliability");
