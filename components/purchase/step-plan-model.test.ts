import { describe, expect, test } from "vitest";
import { DEFAULT_PRICING_CONSTANTS, price } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import {
  currentTotalRsd,
  planPeriodFor,
  premiumDeltaRsd,
  withPlan,
} from "./step-plan-model";

const EMPTY: PurchaseSelection = { services: [], plan: "basic", products: [], step: 2 };

describe("step-plan-model", () => {
  describe("premiumDeltaRsd", () => {
    test("an empty cart reads Premium's raw plan price", () => {
      expect(premiumDeltaRsd(EMPTY, "monthly")).toBe(
        DEFAULT_PRICING_CONSTANTS.plan.premium.monthly,
      );
      expect(premiumDeltaRsd(EMPTY, "annual")).toBe(
        DEFAULT_PRICING_CONSTANTS.plan.premium.annual,
      );
    });

    test("a non-empty cart: the delta is exactly the premium total minus the basic total", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        services: [
          { service: "venue", period: "annual" },
          { service: "memories", period: "annual" },
        ],
      };
      const items = selection.services.map((entry) => ({
        service: entry.service,
        period: entry.period,
      }));
      const basic = price({ items, plan: "basic" }).totalRsd;
      const premium = price({ items, plan: "premium", planPeriod: "annual" }).totalRsd;
      expect(premiumDeltaRsd(selection, "annual")).toBe(premium - basic);
    });

    // Services are priced identically under Basic and Premium (Axis A/B are
    // independent) — so the delta must equal the raw plan price, never a
    // per-service figure (RFC-002 §2.3 hard rule: never divide Premium by the
    // number of services).
    test("the delta equals the plan's raw price, regardless of how many services are in the cart", () => {
      const oneService: PurchaseSelection = {
        ...EMPTY,
        services: [{ service: "review", period: "monthly" }],
      };
      const fiveServices: PurchaseSelection = {
        ...EMPTY,
        services: [
          { service: "links", period: "monthly" },
          { service: "venue", period: "monthly" },
          { service: "memories", period: "monthly" },
          { service: "menu", period: "monthly" },
          { service: "review", period: "monthly" },
        ],
      };
      expect(premiumDeltaRsd(oneService, "monthly")).toBe(
        DEFAULT_PRICING_CONSTANTS.plan.premium.monthly,
      );
      expect(premiumDeltaRsd(fiveServices, "monthly")).toBe(
        DEFAULT_PRICING_CONSTANTS.plan.premium.monthly,
      );
    });
  });

  describe("currentTotalRsd", () => {
    test("null for an empty cart", () => {
      expect(currentTotalRsd(EMPTY)).toBeNull();
    });

    test("equals the engine's basic-plan total for a non-empty cart", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        services: [{ service: "links", period: "annual" }],
      };
      expect(currentTotalRsd(selection)).toBe(
        price({ items: [{ service: "links", period: "annual" }], plan: "basic" }).totalRsd,
      );
    });
  });

  describe("planPeriodFor", () => {
    test("defaults to monthly for an empty cart", () => {
      expect(planPeriodFor(EMPTY)).toBe("monthly");
    });

    test("follows the cart's uniform period", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        services: [{ service: "venue", period: "annual" }],
      };
      expect(planPeriodFor(selection)).toBe("annual");
    });
  });

  describe("withPlan", () => {
    test("switching to premium sets planPeriod from the cart", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        services: [{ service: "venue", period: "annual" }],
      };
      const next = withPlan(selection, "premium");
      expect(next.plan).toBe("premium");
      expect(next.planPeriod).toBe("annual");
    });

    test("switching to basic clears planPeriod", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        plan: "premium",
        planPeriod: "annual",
        services: [{ service: "venue", period: "annual" }],
      };
      const next = withPlan(selection, "basic");
      expect(next.plan).toBe("basic");
      expect(next.planPeriod).toBeUndefined();
    });

    test("the result is always a legal engine input when services are present", () => {
      const selection: PurchaseSelection = {
        ...EMPTY,
        services: [{ service: "memories", period: "monthly" }],
      };
      const premiumSel = withPlan(selection, "premium");
      expect(() =>
        price({
          items: premiumSel.services.map((entry) => ({
            service: entry.service,
            period: entry.period,
          })),
          plan: premiumSel.plan,
          ...(premiumSel.plan === "premium" && premiumSel.planPeriod
            ? { planPeriod: premiumSel.planPeriod }
            : {}),
        }),
      ).not.toThrow();
    });
  });
});
