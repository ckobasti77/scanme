// ScanMe Menu launch prices — a machine-checked proposal, NOT the live prices.
//
// The locked business spec sets ScanMe Menu at 1.490 RSD monthly / 14.900 annual,
// the "lokal" package (Menu + ScanMe Links) at 1.990 / 19.900 and the Premium
// account plan at 990 / 9.990. DEFAULT_PRICING_CONSTANTS deliberately still
// carries menu 890 / 8.990 and lokal 1.590 / 15.990, because changing only those
// two makes invariant 4a throw for the two uniform five-service carts: the
// "kompletan" package (all five services) stays at 3.790 / 37.990 while the
// four-service subset {links, venue, memories, menu} would then cost 4.179
// monthly / 41.997 annual — more than the full cart. Moving kompletan is an
// owner decision, so DEFAULT is intentionally UNCHANGED and golden.json is not
// regenerated. This file is the proof of that conflict plus a ready, verified
// candidate (kompletan 4.290 / 42.900) for the owner.
//
// Open question and the decision to take: docs/tasks/BLOCKED.md, section
// "SCANME MENU V1 — K03".
//
// Every constant set below is built by spreading DEFAULT_PRICING_CONSTANTS;
// DEFAULT itself is never mutated.

import { describe, expect, test } from "vitest";
import {
  BILLING_PERIODS,
  DEFAULT_PRICING_CONSTANTS,
  PricingInvariantError,
  SERVICE_IDS,
  priceWith,
  type PriceInput,
  type PriceItem,
  type PricingConstants,
} from "./engine";
import type { PeriodPrice } from "./constants";
import { goldenKey } from "./golden";
import type { BillingPeriod, PlanId } from "./types";

const MENU_LAUNCH: PeriodPrice = { monthly: 1490, annual: 14900 };
const LOKAL_LAUNCH: PeriodPrice = { monthly: 1990, annual: 19900 };
const KOMPLETAN_UNCHANGED: PeriodPrice = { monthly: 3790, annual: 37990 };
const KOMPLETAN_CANDIDATE: PeriodPrice = { monthly: 4290, annual: 42900 };
const KOMPLETAN_OUT_OF_REACH: PeriodPrice = { monthly: 99999, annual: 999999 };

/** DEFAULT with the launch Menu and Lokal prices and the given Kompletan price.
 *  Everything else — the other services, the plan lines, the other packages,
 *  the ladder and the invariant thresholds — comes from DEFAULT untouched. */
function launchConstants(kompletan: PeriodPrice): PricingConstants {
  const base = DEFAULT_PRICING_CONSTANTS;
  return {
    ...base,
    service: { ...base.service, menu: { ...MENU_LAUNCH } },
    packages: base.packages.map((pkg) => {
      if (pkg.id === "lokal") return { ...pkg, price: { ...LOKAL_LAUNCH } };
      if (pkg.id === "kompletan") return { ...pkg, price: { ...kompletan } };
      return pkg;
    }),
  };
}

const PLAN_VARIANTS: ReadonlyArray<{ plan: PlanId; planPeriod?: BillingPeriod }> = [
  { plan: "basic" },
  { plan: "premium", planPeriod: "monthly" },
  { plan: "premium", planPeriod: "annual" },
];

interface Cart {
  key: string;
  input: PriceInput;
}

/** The 726 carts of golden.ts, enumerated the same way: 31 non-empty subsets of
 *  SERVICE_IDS × every monthly/annual split × the three plan variants. */
function allGoldenCarts(): Cart[] {
  const carts: Cart[] = [];
  for (let subset = 1; subset < 1 << SERVICE_IDS.length; subset += 1) {
    const services = SERVICE_IDS.filter((_, index) => (subset & (1 << index)) !== 0);
    for (let split = 0; split < 1 << services.length; split += 1) {
      const items = services.map<PriceItem>((service, index) => ({
        service,
        period: BILLING_PERIODS[(split >> index) & 1],
      }));
      for (const variant of PLAN_VARIANTS) {
        carts.push({
          key: goldenKey(items, variant.plan, variant.planPeriod),
          input: { items, plan: variant.plan, planPeriod: variant.planPeriod },
        });
      }
    }
  }
  return carts;
}

function uniform(
  services: readonly PriceItem["service"][],
  period: BillingPeriod,
): PriceItem[] {
  return services.map((service) => ({ service, period }));
}

const FIVE_SERVICES = ["links", "venue", "memories", "menu", "review"] as const;
const FOUR_SERVICES = ["links", "venue", "memories", "menu"] as const;

function fiveServiceCart(period: BillingPeriod): PriceInput {
  return { items: uniform(FIVE_SERVICES, period), plan: "basic" };
}

/** The error a cart throws under `cs`, or null when it prices. */
function invariantOf(cs: PricingConstants, input: PriceInput): number | null {
  try {
    priceWith(cs, input);
    return null;
  } catch (error) {
    if (error instanceof PricingInvariantError) return error.invariant;
    throw error;
  }
}

describe("ScanMe Menu launch: predlog cena (podrazumevane konstante ostaju netaknute)", () => {
  test("Premium plan je u podrazumevanim konstantama već 990 / 9.990", () => {
    expect(DEFAULT_PRICING_CONSTANTS.plan.premium).toEqual({ monthly: 990, annual: 9990 });
    expect(launchConstants(KOMPLETAN_CANDIDATE).plan).toBe(DEFAULT_PRICING_CONSTANTS.plan);
  });

  test("sa nepromenjenim Kompletanom (3.790 / 37.990) baca samo 6 korpi od 726, invarijanta 4", () => {
    const cs = launchConstants(KOMPLETAN_UNCHANGED);
    const carts = allGoldenCarts();
    expect(carts).toHaveLength(726);

    const failing: string[] = [];
    let priced = 0;
    for (const cart of carts) {
      const invariant = invariantOf(cs, cart.input);
      if (invariant === null) {
        priced += 1;
      } else {
        // Only invariant 4 may be the reason — never 1, 2 or 3.
        expect(invariant, `neočekivana invarijanta za ${cart.key}`).toBe(4);
        failing.push(cart.key);
      }
    }

    // The uniform five-service carts, all-monthly and all-annual, times the
    // three plan variants.
    const expected = (["monthly", "annual"] as const).flatMap((period) =>
      PLAN_VARIANTS.map((variant) =>
        goldenKey(uniform(FIVE_SERVICES, period), variant.plan, variant.planPeriod),
      ),
    );
    expect([...failing].sort()).toEqual([...expected].sort());
    expect(failing).toHaveLength(6);
    expect(priced).toBe(720);
  });

  test("granica Kompletana: 4.178 baca, 4.179 prolazi (mesečno); 41.996 baca, 41.997 prolazi (godišnje)", () => {
    // The floor is the four-service subset {links, venue, memories, menu}.
    const outOfReach = launchConstants(KOMPLETAN_OUT_OF_REACH);
    expect(
      priceWith(outOfReach, { items: uniform(FOUR_SERVICES, "monthly"), plan: "basic" })
        .servicesChargedRsd,
    ).toBe(4179);
    expect(
      priceWith(outOfReach, { items: uniform(FOUR_SERVICES, "annual"), plan: "basic" })
        .servicesChargedRsd,
    ).toBe(41997);

    // The other period stays at the candidate value so only one edge moves.
    const monthlyCart = fiveServiceCart("monthly");
    expect(
      invariantOf(
        launchConstants({ monthly: 4178, annual: KOMPLETAN_CANDIDATE.annual }),
        monthlyCart,
      ),
    ).toBe(4);
    expect(
      invariantOf(
        launchConstants({ monthly: 4179, annual: KOMPLETAN_CANDIDATE.annual }),
        monthlyCart,
      ),
    ).toBeNull();

    const annualCart = fiveServiceCart("annual");
    expect(
      invariantOf(
        launchConstants({ monthly: KOMPLETAN_CANDIDATE.monthly, annual: 41996 }),
        annualCart,
      ),
    ).toBe(4);
    expect(
      invariantOf(
        launchConstants({ monthly: KOMPLETAN_CANDIDATE.monthly, annual: 41997 }),
        annualCart,
      ),
    ).toBeNull();
  });

  test("gornja granica: kad Kompletan ne važi, pet usluga košta 4.424 mesečno / 44.492 godišnje", () => {
    const cs = launchConstants(KOMPLETAN_OUT_OF_REACH);

    const monthly = priceWith(cs, fiveServiceCart("monthly"));
    expect(monthly.servicesChargedRsd).toBe(4424);
    expect(monthly.packages.map((entry) => entry.packageId)).not.toContain("kompletan");
    expect(monthly.lines.every((line) => line.packageId !== "kompletan")).toBe(true);

    const annual = priceWith(cs, fiveServiceCart("annual"));
    expect(annual.servicesChargedRsd).toBe(44492);
    expect(annual.packages.map((entry) => entry.packageId)).not.toContain("kompletan");
    expect(annual.lines.every((line) => line.packageId !== "kompletan")).toBe(true);
  });

  test("kandidat (Kompletan 4.290 / 42.900) prolazi svih 726 korpi i daje lansirne cene", () => {
    const cs = launchConstants(KOMPLETAN_CANDIDATE);

    for (const cart of allGoldenCarts()) {
      expect(() => priceWith(cs, cart.input), `korpa ${cart.key} baca`).not.toThrow();
    }

    // Menu alone.
    expect(priceWith(cs, { items: uniform(["menu"], "monthly"), plan: "basic" }).servicesChargedRsd).toBe(1490);
    expect(priceWith(cs, { items: uniform(["menu"], "annual"), plan: "basic" }).servicesChargedRsd).toBe(14900);

    // Lokal = Links + Menu, attributed as the "lokal" package.
    for (const [period, expected] of [
      ["monthly", 1990],
      ["annual", 19900],
    ] as const) {
      const lokal = priceWith(cs, { items: uniform(["links", "menu"], period), plan: "basic" });
      expect(lokal.servicesChargedRsd).toBe(expected);
      expect(lokal.packages.map((entry) => entry.packageId)).toEqual(["lokal"]);
      expect(lokal.lines.every((line) => line.packageId === "lokal")).toBe(true);
    }

    // Premium plan line.
    const menuMonthly = uniform(["menu"], "monthly");
    expect(priceWith(cs, { items: menuMonthly, plan: "premium", planPeriod: "monthly" }).planLine.amountRsd).toBe(990);
    expect(priceWith(cs, { items: menuMonthly, plan: "premium", planPeriod: "annual" }).planLine.amountRsd).toBe(9990);

    // Five services: Kompletan, cheaper than the 4.424 / 44.492 ladder price.
    for (const [period, expected] of [
      ["monthly", 4290],
      ["annual", 42900],
    ] as const) {
      const full = priceWith(cs, fiveServiceCart(period));
      expect(full.servicesChargedRsd).toBe(expected);
      expect(full.packages.map((entry) => entry.packageId)).toEqual(["kompletan"]);
      expect(full.lines.every((line) => line.packageId === "kompletan")).toBe(true);
    }
  });

  test("domet promene: samo korpe sa Menu-om se menjaju u odnosu na podrazumevane konstante", () => {
    const candidate = launchConstants(KOMPLETAN_CANDIDATE);
    const carts = allGoldenCarts();

    const withMenu = carts.filter((cart) => cart.input.items.some((item) => item.service === "menu"));
    const withoutMenu = carts.filter((cart) => !cart.input.items.some((item) => item.service === "menu"));

    // 3^5 - 3^4 = 162 (subset, split) pairs hold Menu, times three plan variants.
    expect(withMenu).toHaveLength(486);
    expect(withoutMenu).toHaveLength(240);

    // No Menu in the cart: byte-for-byte the same breakdown as today.
    for (const cart of withoutMenu) {
      expect(priceWith(candidate, cart.input), `korpa ${cart.key} se promenila`).toEqual(
        priceWith(DEFAULT_PRICING_CONSTANTS, cart.input),
      );
    }

    // Menu in the cart: its list price moved, so every one of these golden
    // cases would change if the owner activates the candidate.
    for (const cart of withMenu) {
      expect(priceWith(candidate, cart.input), `korpa ${cart.key} se nije promenila`).not.toEqual(
        priceWith(DEFAULT_PRICING_CONSTANTS, cart.input),
      );
    }
  });
});
