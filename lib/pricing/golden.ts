// The golden table generator (RFC-002 §2.1, TASK-01).
//
// Every non-empty subset of the five services (31), times every legal split of
// that subset across the two periods (2^k), times every plan variant the flow
// can reach (Basic, Premium monthly, Premium annual) — 726 carts, each with its
// full expected `PriceBreakdown`. The table is committed as `golden.json` and
// regenerated from `constants.ts` by `npm run pricing:golden`.
//
// Enterprise is not in the table: it is quoted by hand and is a dead end in the
// flow (RFC-002 §2.3 step 2), so it has no computed breakdown to lock.
//
// The point of the table is that price is a thing you must never change by
// ACCIDENT. `golden.test.ts` fails on any drift; a deliberate price change is a
// constants edit plus a regeneration, in one reviewable commit.

import { BILLING_PERIODS, SERVICE_IDS, price } from "./engine";
import type { BillingPeriod, PlanId, PriceBreakdown, PriceItem } from "./types";

export interface GoldenCase {
  key: string;
  items: PriceItem[];
  plan: PlanId;
  planPeriod?: BillingPeriod;
  breakdown: PriceBreakdown;
}

export interface GoldenTable {
  engineVersion: number;
  caseCount: number;
  cases: GoldenCase[];
}

const PLAN_VARIANTS: ReadonlyArray<{ plan: PlanId; planPeriod?: BillingPeriod }> = [
  { plan: "basic" },
  { plan: "premium", planPeriod: "monthly" },
  { plan: "premium", planPeriod: "annual" },
];

const PERIOD_CODE: Record<BillingPeriod, string> = { monthly: "m", annual: "a" };

export function goldenKey(
  items: readonly PriceItem[],
  plan: PlanId,
  planPeriod?: BillingPeriod,
): string {
  const cart = items.map((item) => `${item.service}:${PERIOD_CODE[item.period]}`).join("+");
  return `${cart}|${plan}${planPeriod ? `:${PERIOD_CODE[planPeriod]}` : ""}`;
}

/** Deterministic: subsets in canonical service order, period splits in binary
 *  order, plan variants in the order above. The nth case is always the nth. */
export function generateGoldenTable(): GoldenTable {
  const cases: GoldenCase[] = [];
  for (let subset = 1; subset < 1 << SERVICE_IDS.length; subset += 1) {
    const services = SERVICE_IDS.filter((_, index) => (subset & (1 << index)) !== 0);
    for (let split = 0; split < 1 << services.length; split += 1) {
      const items = services.map<PriceItem>((service, index) => ({
        service,
        period: BILLING_PERIODS[(split >> index) & 1],
      }));
      for (const variant of PLAN_VARIANTS) {
        cases.push({
          key: goldenKey(items, variant.plan, variant.planPeriod),
          items,
          ...variant,
          breakdown: price({ items, plan: variant.plan, planPeriod: variant.planPeriod }),
        });
      }
    }
  }
  return { engineVersion: cases[0].breakdown.engineVersion, caseCount: cases.length, cases };
}

/** One case per line, so a price drift reads as a one-line diff. */
export function serializeGoldenTable(table: GoldenTable): string {
  const lines = table.cases.map((entry) => `    ${JSON.stringify(entry)}`);
  return (
    `{\n` +
    `  "engineVersion": ${table.engineVersion},\n` +
    `  "caseCount": ${table.caseCount},\n` +
    `  "cases": [\n${lines.join(",\n")}\n  ]\n` +
    `}\n`
  );
}
