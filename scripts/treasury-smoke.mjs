import assert from "node:assert/strict";
import { computeSituation, operationalAmountCents } from "../src/server/treasury/situation.ts";
import { calcBreakEven, calcWorkingCapital } from "../src/server/treasury/calculators.ts";

assert.equal(
  computeSituation({ dueDate: "2020-01-01", settledAt: null, today: "2026-09-22" }),
  "overdue"
);
assert.equal(
  computeSituation({ dueDate: "2026-09-25", settledAt: null, today: "2026-09-22" }),
  "this_week"
);
assert.equal(
  computeSituation({ dueDate: "2026-12-01", settledAt: new Date(), today: "2026-09-22" }),
  "settled"
);
assert.equal(operationalAmountCents({ forecastCents: 1000, actualCents: null }), 1000);

const wc = calcWorkingCapital({
  inventoryCents: 5_000_000,
  receivableDays: 15,
  payableDays: 30,
  monthlySalesCents: 8_000_000,
  monthlyCogsCents: 2_500_000,
  monthlyFixedCents: 3_500_000,
});
assert.ok(wc.workingCapitalCents !== 0);

const be = calcBreakEven({
  unitPriceCents: 8000,
  variableCostCents: 2000,
  fixedCostsCents: 3_500_000,
  taxPercent: 6,
});
assert.ok(be.breakEvenUnits > 0);

console.log("treasury smoke ok");
